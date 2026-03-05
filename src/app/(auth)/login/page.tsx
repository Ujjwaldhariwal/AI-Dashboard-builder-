'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'                          // ✅ added
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input }   from '@/components/ui/input'
import { Button }  from '@/components/ui/button'
import { Label }   from '@/components/ui/label'
import { BarChart3, Lock, Loader2, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { toast }   from 'sonner'
import { createClient }  from '@/lib/supabase/client'
import { useAuthStore }  from '@/store/auth-store'

// ── All known Supabase auth error messages ────────────────────
const isInvalidCredentials = (msg: string) =>
  msg.includes('Invalid login credentials') ||
  msg.includes('invalid_credentials') ||
  msg.includes('Invalid email or password') ||
  msg.includes('Email not confirmed') ||
  msg.toLowerCase().includes('invalid login')

const isUserNotFound = (msg: string) =>
  msg.includes('User not found') ||
  msg.includes('user_not_found') ||
  msg.includes('No user found')

const isAlreadyRegistered = (msg: string) =>
  msg.includes('already registered') ||
  msg.includes('User already registered') ||
  msg.includes('email_exists')

const isRateLimit = (msg: string) =>
  msg.includes('rate limit') ||
  msg.includes('too many requests') ||
  msg.includes('over_email_send_rate_limit')

type FieldError = {
  empId?:    string
  password?: string
  general?:  string
}

export default function LoginPage() {
  const router = useRouter()                                          // ✅ added

  const [empId, setEmpId]         = useState('')
  const [password, setPassword]   = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showPass, setShowPass]   = useState(false)
  const [fieldError, setFieldError] = useState<FieldError>({})

  const { checkSession } = useAuthStore()
  const supabase = createClient()

  const clearErrors = () => setFieldError({})

  const validate = (): boolean => {
    const errors: FieldError = {}

    if (!empId.trim()) {
      errors.empId = 'Employee ID is required'
    } else if (!/^[a-zA-Z0-9_-]+$/.test(empId.trim())) {
      errors.empId = 'Employee ID can only contain letters, numbers, - and _'
    }

    if (!password) {
      errors.password = 'Password is required'
    } else if (password.length < 6) {
      errors.password = `Password must be at least 6 characters (${6 - password.length} more needed)`
    } else if (password.length > 72) {
      errors.password = 'Password cannot exceed 72 characters'
    }

    setFieldError(errors)
    return Object.keys(errors).length === 0
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    clearErrors()
    if (!validate()) return

    setIsLoading(true)

    // ✅ redirectTo — honor middleware redirect param
    const params     = new URLSearchParams(window.location.search)
    const redirectTo = params.get('redirectTo') ?? '/workspaces'
    const email      = `${empId.trim().toLowerCase()}@company.com`

    // ✅ Fix #2 — local flag tracks field errors set DURING this call
    // avoids stale closure on fieldError state in catch block
    let fieldErrorSet = false

    try {
      // ── ATTEMPT 1: Sign in ────────────────────────────────────
      const { data: signInData, error: signInError } =
        await supabase.auth.signInWithPassword({ email, password })

      if (!signInError && signInData.session) {
        toast.success('Welcome back!', { id: 'auth' })
        await checkSession()
        router.push(redirectTo)                                       // ✅ uses redirectTo
        return
      }

      if (signInError) {
        if (isRateLimit(signInError.message)) {
          throw new Error('Too many attempts. Please wait a minute and try again.')
        }

        if (isInvalidCredentials(signInError.message) && !isUserNotFound(signInError.message)) {
          const { error: probeError } = await supabase.auth.signUp({
            email,
            password: 'probe-only-not-used-x9z2',
            options: { data: { emp_id: empId.trim().toUpperCase() } },
          })

          if (probeError && isAlreadyRegistered(probeError.message)) {
            // User exists → wrong password
            setFieldError({ password: 'Incorrect password. Please try again.' })
            fieldErrorSet = true                                      // ✅ flag set
            setIsLoading(false)
            return
          }
          // User does not exist → fall through to registration
        }

        if (
          !isInvalidCredentials(signInError.message) &&
          !isUserNotFound(signInError.message)
        ) {
          throw new Error(signInError.message)
        }
      }

      // ── ATTEMPT 2: Register new employee ──────────────────────
      toast.loading('First time login – setting up your account...', { id: 'auth' })

      const { data: signUpData, error: signUpError } =
        await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              emp_id: empId.trim().toUpperCase(),
              name:   `Employee ${empId.trim().toUpperCase()}`,
            },
          },
        })

      if (signUpError) {
        if (isAlreadyRegistered(signUpError.message)) {
          setFieldError({ password: 'Incorrect password. Please try again.' })
          fieldErrorSet = true                                        // ✅ flag set
          setIsLoading(false)
          toast.dismiss('auth')
          return
        }
        if (isRateLimit(signUpError.message)) {
          throw new Error('Too many attempts. Please wait a minute and try again.')
        }
        throw signUpError
      }

      // ── ATTEMPT 3: Sign in right after sign up ────────────────
      const { data: finalSignIn, error: finalError } =
        await supabase.auth.signInWithPassword({ email, password })

      if (finalError) {
        if (
          finalError.message.includes('Email not confirmed') ||
          finalError.message.includes('email_not_confirmed')
        ) {
          throw new Error(
            'A confirmation email has been sent. Please check your inbox, then sign in again.',
          )
        }
        throw new Error('Account created but sign-in failed. Please try logging in again.')
      }

      if (!finalSignIn.session) {
        throw new Error(
          'Account registered. Please check your email to confirm, then sign in.',
        )
      }

      toast.success('Account created & signed in!', { id: 'auth' })
      await checkSession()
      router.push(redirectTo)                                         // ✅ uses redirectTo

    } catch (err: unknown) {
      // ✅ Fix #1 — err typed as unknown, safe message extraction
      const message = err instanceof Error
        ? err.message
        : 'Authentication failed. Please try again.'

      console.error('[Auth]', err)
      toast.dismiss('auth')

      // ✅ Fix #2 — use local flag, not stale fieldError state
      if (!fieldErrorSet) {
        setFieldError({ general: message })
      }
      setIsLoading(false)
    }
  }

  const passShort = password.length > 0 && password.length < 6

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
        <form onSubmit={handleLogin} className="space-y-5" noValidate>

          {/* ── General error banner ─────────────────────────── */}
          {fieldError.general && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg border border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/20">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-400">{fieldError.general}</p>
            </div>
          )}

          {/* ── Employee ID ──────────────────────────────────── */}
          <div className="space-y-1.5 text-left">
            <Label htmlFor="empId">Employee ID</Label>
            <Input
              id="empId"
              placeholder="e.g. EMP001"
              value={empId}
              onChange={e => { setEmpId(e.target.value); clearErrors() }}
              className={`h-11 bg-background/50 ${
                fieldError.empId ? 'border-red-400 focus-visible:ring-red-400' : ''
              }`}
              autoComplete="username"
              disabled={isLoading}
              autoFocus
            />
            {fieldError.empId && (
              <p className="text-[11px] text-red-500 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {fieldError.empId}
              </p>
            )}
          </div>

          {/* ── Password ─────────────────────────────────────── */}
          <div className="space-y-1.5 text-left">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPass ? 'text' : 'password'}
                placeholder="Min 6 characters"
                value={password}
                onChange={e => { setPassword(e.target.value); clearErrors() }}
                className={`h-11 bg-background/50 pr-10 ${
                  fieldError.password || passShort
                    ? 'border-red-400 focus-visible:ring-red-400'
                    : ''
                }`}
                autoComplete="current-password"
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {fieldError.password && (
              <p className="text-[11px] text-red-500 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {fieldError.password}
              </p>
            )}

            {passShort && !fieldError.password && (
              <p className="text-[11px] text-amber-500">
                {6 - password.length} more character{6 - password.length !== 1 ? 's' : ''} needed
              </p>
            )}
          </div>

          {/* ── Submit ───────────────────────────────────────── */}
          <Button
            type="submit"
            className="w-full h-11 text-base font-medium shadow-md"
            disabled={isLoading || passShort}
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

          <p className="text-xs text-center text-muted-foreground pt-2">
            New Employee IDs are automatically registered on first login.
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
