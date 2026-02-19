'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/auth-store'

export default function LoginPage() {
  const router = useRouter()
  const login = useAuthStore((s) => s.login)
  const [empId, setEmpId] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!empId || !password) {
      toast.error('Please enter employee ID and password')
      return
    }

    // Phase 1: simple fake auth; later we hook to real backend / AD / SSO
    setLoading(true)
    setTimeout(() => {
      login({
        id: empId,
        name: `Employee ${empId}`,
        email: `${empId}@company.com`,
        role: 'employee',
      })
      setLoading(false)
      toast.success('Logged in successfully')
      router.push('/workspaces')
    }, 600)
  }

  return (
    <Card className="w-full max-w-md shadow-2xl border-slate-800 bg-slate-900/80 backdrop-blur">
      <CardHeader>
        <CardTitle className="text-2xl text-white">Analytics AI – Employee Login</CardTitle>
        <CardDescription className="text-slate-300">
          Sign in with your employee credentials to create dashboards
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="empId" className="text-slate-200">
              Employee ID
            </Label>
            <Input
              id="empId"
              placeholder="e.g. EMP1234"
              value={empId}
              onChange={(e) => setEmpId(e.target.value)}
              className="bg-slate-900 border-slate-700 text-slate-50"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-slate-200">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-slate-900 border-slate-700 text-slate-50"
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={loading}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
