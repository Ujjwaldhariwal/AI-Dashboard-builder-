// Component: Page
// src/app/(auth)/login/page.tsx
'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { BarChart3, Lock, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/store/auth-store'

export default function LoginPage() {
  const [empId, setEmpId] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { checkSession } = useAuthStore()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!empId.trim() || !password) {
      toast.error('Please enter Employee ID and Password')
      return
    }

    setIsLoading(true)
    const email = `${empId.trim().toLowerCase()}@company.com`

    try {
      // STEP 1: Try signing in
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

      if (signInError) {
        if (!signInError.message.includes('Invalid login')) {
          // Network error, rate limit, etc.
          throw signInError
        }

        // STEP 2: "Invalid login" = new user. Try registering them.
        toast.loading('First time login — setting up account...', { id: 'auth' })

        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              emp_id: empId.trim().toUpperCase(),
              name: `Employee ${empId.trim().toUpperCase()}`,
            },
          },
        })

        if (signUpError) {
          if (signUpError.message.includes('already registered')) {
            // Account exists → they just typed wrong password
            throw new Error('Incorrect password. Please try again.')
          }
          throw signUpError
        }

        // STEP 3: signUp alone won't create a session if email confirmation
        // is ON in Supabase. So we ALWAYS sign in again right after signUp
        // to guarantee a real session cookie is set.
        const { error: signInAfterSignUpError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (signInAfterSignUpError) {
          // Extremely rare edge case — account was created but login failed
          throw new Error('Account created but login failed. Please try signing in again.')
        }

        toast.success('Account created & signed in!', { id: 'auth' })
      } else {
        toast.success('Login successful!', { id: 'auth' })
      }

      // STEP 4: Session is now guaranteed. Sync Zustand store.
      await checkSession()

      // STEP 5: Redirect. Small delay so the cookie write fully completes.
      setTimeout(() => {
        window.location.href = '/workspaces'
      }, 300)

    } catch (err: any) {
      console.error('Auth error:', err)
      toast.error(err.message || 'Failed to authenticate', { id: 'auth' })
      setIsLoading(false)
    }
    // NOTE: No finally block — we intentionally keep isLoading=true
    // during the redirect so the spinner stays visible until page change.
  }

  return (
    <Card className="w-full max-w-md mx-4 shadow-2xl border-muted/50 bg-background/60 backdrop-blur-xl">
      <CardHeader className="space-y-3 pb-6 text-center">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center mx-auto mb-2 shadow-lg">
          <BarChart3 className="w-6 h-6 text-white" />
        </div>
        <CardTitle className="text-2xl font-bold tracking-tight">AI Dashboard Builder</CardTitle>
        <CardDescription className="text-base">
          Sign in with your Employee ID
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-2 text-left">
            <Label htmlFor="empId">Employee ID</Label>
            <Input
              id="empId"
              placeholder="e.g. EMP001"
              value={empId}
              onChange={(e) => setEmpId(e.target.value)}
              className="h-11 bg-background/50"
              autoComplete="username"
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2 text-left">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 bg-background/50"
              autoComplete="current-password"
              disabled={isLoading}
            />
          </div>

          <Button
            type="submit"
            className="w-full h-11 text-base font-medium shadow-md transition-all hover:shadow-lg"
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Lock className="w-4 h-4 mr-2" />
                Sign In securely
              </>
            )}
          </Button>

          <p className="text-xs text-center text-muted-foreground pt-4">
            New Employee IDs will be automatically registered for this POC.
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
