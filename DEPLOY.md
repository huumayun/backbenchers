# Vercel Deployment Configuration

## Environment Variables to Add in Vercel:

### Firebase Config:
```
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyBswZK0vDWoHeU8uq48ehqsWcpQHcfE668
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=botany-1d1e6.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=botany-1d1e6
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=botany-1d1e6.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=879445393590
NEXT_PUBLIC_FIREBASE_APP_ID=1:879445393590:web:766f926f46693970936617
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-R9V4HHESL0
```

### Admin & App Config:
```
ADMIN_SECRET=backbencher_botany_admin_2026
NEXT_PUBLIC_FREE_PAGES=10
```

## Deployment Steps:
1. Push to GitHub (without content/ folder - it's in .gitignore)
2. Go to vercel.com → Import project from GitHub
3. Add all environment variables above
4. **IMPORTANT**: Upload book.html separately to Vercel via build script or use Vercel Blob Storage

## Note on Book Content:
Since `content/` is in .gitignore for security, you have two options:
- Option A: Remove `content/` from .gitignore and include it in Git (simpler but book is in repo)
- Option B: Use Vercel Blob Storage to store book.html privately (more secure)

For now (development), Option A is recommended.
