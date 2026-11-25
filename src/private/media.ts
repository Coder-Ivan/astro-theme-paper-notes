import type { APIRoute } from 'astro';
import { diaryPosts } from '../lib/journal.ts';
import { attachmentNames, attachmentResponse } from '../lib/media.ts';

export function getStaticPaths() { return attachmentNames(diaryPosts, '/diary/media/'); }
export const GET: APIRoute = ({ params }) => attachmentResponse(params.name!);
