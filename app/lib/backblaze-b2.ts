import { createHash, randomUUID } from "node:crypto"

type B2AuthResponse = {
  apiInfo: {
    storageApi: {
      apiUrl: string
      downloadUrl: string
    }
  }
  authorizationToken: string
}

type B2UploadUrlResponse = {
  authorizationToken: string
  uploadUrl: string
}

type B2ListFileNamesResponse = {
  files: Array<{
    fileId: string
    fileName: string
  }>
}

type B2AuthorizedContext = {
  apiUrl: string
  authorizationToken: string
  bucketId: string
  bucketName: string
  downloadUrl: string
}

function getRequiredEnv(name: "B2_KEY_ID" | "B2_APPLICATION_KEY" | "B2_BUCKET_ID" | "B2_BUCKET_NAME") {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not configured.`)
  }
  return value
}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-")
}

async function authorizeB2(): Promise<B2AuthorizedContext> {
  const keyId = getRequiredEnv("B2_KEY_ID")
  const applicationKey = getRequiredEnv("B2_APPLICATION_KEY")
  const bucketId = getRequiredEnv("B2_BUCKET_ID")
  const bucketName = getRequiredEnv("B2_BUCKET_NAME")
  const authHeader = Buffer.from(`${keyId}:${applicationKey}`).toString("base64")

  const authResponse = await fetch("https://api.backblazeb2.com/b2api/v3/b2_authorize_account", {
    headers: {
      Authorization: `Basic ${authHeader}`,
    },
    cache: "no-store",
  })

  if (!authResponse.ok) {
    throw new Error("Backblaze B2 の認証に失敗しました。")
  }

  const authData = (await authResponse.json()) as B2AuthResponse
  return {
    apiUrl: authData.apiInfo.storageApi.apiUrl,
    authorizationToken: authData.authorizationToken,
    bucketId,
    bucketName,
    downloadUrl: authData.apiInfo.storageApi.downloadUrl,
  }
}

export function buildPostImageProxyUrl(fileName: string) {
  const encodedPath = fileName
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")

  return `/api/post-images/file/${encodedPath}`
}

export async function uploadFileToB2(file: File, ownerId: string) {
  const authContext = await authorizeB2()

  const uploadUrlResponse = await fetch(`${authContext.apiUrl}/b2api/v3/b2_get_upload_url`, {
    method: "POST",
    headers: {
      Authorization: authContext.authorizationToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ bucketId: authContext.bucketId }),
    cache: "no-store",
  })

  if (!uploadUrlResponse.ok) {
    throw new Error("Backblaze B2 のアップロードURL取得に失敗しました。")
  }

  const uploadData = (await uploadUrlResponse.json()) as B2UploadUrlResponse
  const buffer = Buffer.from(await file.arrayBuffer())
  const sha1 = createHash("sha1").update(buffer).digest("hex")
  const extension = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : ""
  const fileName = `posts/${ownerId}/${randomUUID()}-${sanitizeFileName(file.name.replace(/\.[^.]+$/, ""))}${extension}`

  const b2Response = await fetch(uploadData.uploadUrl, {
    method: "POST",
    headers: {
      Authorization: uploadData.authorizationToken,
      "X-Bz-File-Name": encodeURIComponent(fileName),
      "Content-Type": file.type || "b2/x-auto",
      "Content-Length": buffer.byteLength.toString(),
      "X-Bz-Content-Sha1": sha1,
    },
    body: buffer,
    cache: "no-store",
  })

  if (!b2Response.ok) {
    throw new Error("Backblaze B2 への画像アップロードに失敗しました。")
  }

  return {
    url: buildPostImageProxyUrl(fileName),
    fileName,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: buffer.byteLength,
  }
}

export async function downloadFileFromB2(fileName: string) {
  const authContext = await authorizeB2()
  const response = await fetch(`${authContext.downloadUrl}/file/${authContext.bucketName}/${fileName}`, {
    headers: {
      Authorization: authContext.authorizationToken,
    },
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error("Backblaze B2 から画像を取得できませんでした。")
  }

  return response
}

export async function deleteFileFromB2(fileName: string) {
  const authContext = await authorizeB2()
  const listResponse = await fetch(`${authContext.apiUrl}/b2api/v3/b2_list_file_names`, {
    method: "POST",
    headers: {
      Authorization: authContext.authorizationToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      bucketId: authContext.bucketId,
      prefix: fileName,
      maxFileCount: 1,
    }),
    cache: "no-store",
  })

  if (!listResponse.ok) {
    throw new Error("Backblaze B2 の画像一覧取得に失敗しました。")
  }

  const listData = (await listResponse.json()) as B2ListFileNamesResponse
  const target = listData.files.find((file) => file.fileName === fileName)

  if (!target) {
    return
  }

  const deleteResponse = await fetch(`${authContext.apiUrl}/b2api/v3/b2_delete_file_version`, {
    method: "POST",
    headers: {
      Authorization: authContext.authorizationToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fileId: target.fileId,
      fileName: target.fileName,
    }),
    cache: "no-store",
  })

  if (!deleteResponse.ok) {
    throw new Error("Backblaze B2 の画像削除に失敗しました。")
  }
}
