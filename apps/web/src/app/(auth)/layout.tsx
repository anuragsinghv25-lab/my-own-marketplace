import { AuthFrame } from '@/components/auth/auth-frame';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AuthFrame marketplace={process.env.NEXT_PUBLIC_MARKETPLACE_NAME ?? 'Orbita'}>{children}</AuthFrame>;
}
