import { IsObject } from 'class-validator';

/** Partial content patch for inline editor — validated + sanitized server-side. */
export class FunnelInlineContentPatchDto {
  @IsObject()
  patch!: Record<string, unknown>;
}

export class FunnelPublishLiveUpdateDto {
  summary?: string;
}
