/** Positional transcript I/O. Local readers keep a FileHandle; SSH pages
 *  through `fs.readFileRange` so a growing JSONL is never re-copied whole. */
export type TranscriptFileStamp = {
  size: number
  identity: string
  mtimeMs: number
  ctimeMs: number
}

export type TranscriptRangeFs = {
  stat(filePath: string, signal?: AbortSignal): Promise<TranscriptFileStamp>
  read(filePath: string, position: number, length: number, signal?: AbortSignal): Promise<Buffer>
}
