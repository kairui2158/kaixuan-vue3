export interface RuntimeBuildFingerprint {
  source: 'vite-manifest' | 'dev'
  manifestVersion: string
  commit: string
  buildTime: string
}

interface BuildManifest {
  schemaVersion?: number
  commit?: string
  buildTime?: string
}

const DEV_FINGERPRINT: RuntimeBuildFingerprint = {
  source: 'dev',
  manifestVersion: '0',
  commit: 'dev',
  buildTime: 'dev',
}

export function resolveRuntimeBuildFingerprint(): RuntimeBuildFingerprint {
  const raw = typeof __SHENYI_BUILD_MANIFEST__ === 'string'
    ? __SHENYI_BUILD_MANIFEST__
    : ''
  if (!raw) return { ...DEV_FINGERPRINT }
  try {
    const manifest = JSON.parse(raw) as BuildManifest
    if (
      !Number.isInteger(manifest.schemaVersion) ||
      typeof manifest.commit !== 'string' ||
      typeof manifest.buildTime !== 'string'
    ) {
      return { ...DEV_FINGERPRINT }
    }
    return {
      source: 'vite-manifest',
      manifestVersion: String(manifest.schemaVersion),
      commit: manifest.commit,
      buildTime: manifest.buildTime,
    }
  } catch {
    return { ...DEV_FINGERPRINT }
  }
}
