import AdminToolsNav from '@/components/admin/AdminToolsNav'

export default function AdminSectionLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AdminToolsNav />
      {children}
    </>
  )
}
