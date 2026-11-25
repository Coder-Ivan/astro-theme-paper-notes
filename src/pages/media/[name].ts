import type { APIRoute } from 'astro';
import { posts } from '../../lib/journal.ts';
import { attachmentNames, attachmentResponse } from '../../lib/media.ts';

export function getStaticPaths() { return attachmentNames(posts, '/media/'); }
export const GET: APIRoute = ({ params }) => attachmentResponse(params.name!);
