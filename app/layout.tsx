import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Stagehand 自动化测试平台',
  description: '企业级 AI 驱动的页面自动化测试平台',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}