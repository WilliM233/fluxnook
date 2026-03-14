import { z } from 'zod';

const envSchema =    z.object({
    DATABASE_URL:    z.string(),
    TMDB_API_KEY:    z.string().optional(),
    NEXTAUTH_SECRET: z.string().optional(),
    NEXTAUTH_URL:    z.string().url().optional()
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    console.error('Invalid environment variables: ', parsed.error.flatten());
    throw new Error('Missing or invalid environment variables');
}

export const env = parsed.data;