export interface RuntimeBuildFingerprint {
  source: 'vite-manifest' | 'dev'
  manifestVersion: string
  commit: string
  buildTime: string
  appVersion: string
  missingFields?: string[]
}

interface BuildManifest {
  schemaVersion?: number
  commit?: string
  buildTime?: string
  appVersion?: string
}

const DEV_FINGERPRINT: RuntimeBuildFingerprint = {
  source: 'dev',
  manifestVersion: '0',
  commit: 'dev',
  buildTime: 'dev',
  appVersion: 'dev',
}

export function resolveRuntimeBuildFingerprint(): RuntimeBuildFingerprint {
  const raw = typeof __SHENYI_BUILD_MANIFEST__ === 'string'
    ? __SHENYI_BUILD_MANIFEST__
    : ''
  if (!raw) return { ...DEV_FINGERPRINT }
  try {
    const manifest = JSON.parse(raw) as BuildManifest
    const missingFields = [
      Number.isInteger(manifest.schemaVersion) ? null : 'schemaVersion',
      typeof manifest.commit === 'string' && manifest.commit ? null : 'commit',
      typeof manifest.buildTime === 'string' && manifest.buildTime ? null : 'buildTime',
      typeof manifest.appVersion === 'string' && manifest.appVersion ? null : 'appVersion',
    ].filter((field): field is string => Boolean(field))
    if (missingFields.length) {
      return { ...DEV_FINGERPRINT }
    }
    const schemaVersion = manifest.schemaVersion as number
    const commit = manifest.commit as string
    const buildTime = manifest.buildTime as string
    const appVersion = manifest.appVersion as string
    return {
      source: 'vite-manifest',
      manifestVersion: String(schemaVersion),
      commit,
      buildTime,
      appVersion,
    }
  } catch {
    return { ...DEV_FINGERPRINT }
  }
}
