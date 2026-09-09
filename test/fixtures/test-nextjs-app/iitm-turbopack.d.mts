export type IitmWrapperResult = {
  initialLive: number
  live: number
  stable: number
  hookedLive: number
}

export declare function runIitmWrapper(): IitmWrapperResult
