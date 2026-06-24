import { PlatformAdminShell } from '@/components/platform/platform-admin-shell'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <PlatformAdminShell>{children}</PlatformAdminShell>
}
