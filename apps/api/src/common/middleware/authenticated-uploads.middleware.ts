import type { NextFunction, Request, Response } from 'express';
import { existsSync, createReadStream, statSync } from 'fs';
import { extname, normalize, resolve, sep } from 'path';
import { JwtService } from '@nestjs/jwt';
import {
  PUBLIC_MEDIA_EXT,
  PUBLIC_UPLOAD_PREFIX,
  SERVE_ALLOWED_EXT,
  SERVE_BLOCKED_EXT,
  contentTypeForExt,
} from '../uploads/upload-policy';
import { verifyUploadSignature } from '../uploads/upload-signed-url';

type JwtPayloadLite = {
  sub?: string;
  organizationId?: string;
  role?: string;
};

/**
 * /uploads/* handler:
 * - public/{...} + image ext → public (safe media for <img>)
 * - private → JWT Bearer / ?access_token= OR HMAC ?exp=&sig=
 * Never serves executables / traversal.
 */
export function createAuthenticatedUploadsHandler(opts: {
  uploadsDir: string;
  jwt: JwtService;
}) {
  const root = resolve(opts.uploadsDir);

  return async (req: Request, res: Response, _next: NextFunction) => {
    try {
      const rawPath = (req.path || '').replace(/^\/uploads\/?/, '');
      if (!rawPath || rawPath.includes('\0')) {
        res.status(400).json({ success: false, message: 'Invalid path' });
        return;
      }

      let decoded: string;
      try {
        decoded = decodeURIComponent(rawPath);
      } catch {
        res.status(400).json({ success: false, message: 'Invalid path encoding' });
        return;
      }
      const normalized = normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, '');
      if (normalized.includes('..')) {
        res.status(400).json({ success: false, message: 'Invalid path' });
        return;
      }

      const abs = resolve(root, normalized);
      if (abs !== root && !abs.startsWith(root + sep)) {
        res.status(400).json({ success: false, message: 'Invalid path' });
        return;
      }

      const ext = extname(abs).toLowerCase();
      if (SERVE_BLOCKED_EXT.has(ext) || (ext && !SERVE_ALLOWED_EXT.has(ext))) {
        res.status(403).json({ success: false, message: 'File type not allowed' });
        return;
      }

      const isPublicMedia =
        normalized.replace(/\\/g, '/').startsWith(PUBLIC_UPLOAD_PREFIX) &&
        PUBLIC_MEDIA_EXT.has(ext);

      let authOk = isPublicMedia;

      if (!authOk) {
        const sigOk = verifyUploadSignature(
          normalized.replace(/\\/g, '/'),
          req.query.exp,
          req.query.sig,
        );
        if (sigOk) authOk = true;
      }

      let payload: JwtPayloadLite | null = null;
      if (!authOk) {
        const auth = req.headers.authorization;
        const bearer =
          typeof auth === 'string' && auth.startsWith('Bearer ')
            ? auth.slice(7).trim()
            : '';
        const q = typeof req.query.access_token === 'string' ? req.query.access_token.trim() : '';
        const token = bearer || q;
        if (!token) {
          res.status(401).json({ success: false, message: 'Unauthorized' });
          return;
        }
        try {
          payload = await opts.jwt.verifyAsync<JwtPayloadLite>(token);
        } catch {
          res.status(401).json({ success: false, message: 'Unauthorized' });
          return;
        }
        if (!payload?.organizationId || !payload.sub) {
          res.status(401).json({ success: false, message: 'Unauthorized' });
          return;
        }
        authOk = true;
      }

      const parts = normalized.split(/[/\\]/).filter(Boolean);
      if (parts[0] === 'hrm' && parts[1] && payload) {
        const fileOrg = parts[1];
        if (payload.role !== 'SUPER_ADMIN' && fileOrg !== payload.organizationId) {
          res.status(403).json({ success: false, message: 'Forbidden' });
          return;
        }
      }
      if (parts[0] === 'work' && parts[1] && payload) {
        const fileOrg = parts[1];
        if (payload.role !== 'SUPER_ADMIN' && fileOrg !== payload.organizationId) {
          res.status(403).json({ success: false, message: 'Forbidden' });
          return;
        }
      }

      if (!existsSync(abs) || !statSync(abs).isFile()) {
        res.status(404).json({ success: false, message: 'Not found' });
        return;
      }

      const st = statSync(abs);
      if (st.size > 50 * 1024 * 1024) {
        res.status(413).json({ success: false, message: 'File too large' });
        return;
      }

      res.setHeader('Content-Type', contentTypeForExt(ext));
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader(
        'Cache-Control',
        isPublicMedia ? 'public, max-age=3600' : 'private, no-store',
      );
      res.setHeader('Content-Length', String(st.size));
      createReadStream(abs).pipe(res);
    } catch {
      res.status(500).json({ success: false, message: 'Upload serve error' });
    }
  };
}
