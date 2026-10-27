import { z } from 'zod';

/** The signed-in user's backend account, as returned by glsstudentapi `GET /api/accountInfo`. */
export const accountInfoSchema = z.object({
  username: z.string().nullable(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  roles: z.array(z.string()),
  authorities: z.array(z.string()),
  /** Null when the backend does not report it. */
  isActive: z.boolean().nullable(),
});
export type AccountInfo = z.infer<typeof accountInfoSchema>;
