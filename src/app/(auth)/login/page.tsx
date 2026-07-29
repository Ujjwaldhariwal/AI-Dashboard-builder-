"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  BarChart3,
  Eye,
  EyeOff,
  Loader2,
  Lock,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resolveSafeInternalRedirect } from "@/lib/auth/safe-redirect";
import { enableDashboardOsDemoMode } from "@/lib/dashboardos/demo-mode";
import { createClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/auth-store";

const supabase = createClient();

const isInvalidCredentials = (message: string) =>
  message.includes("Invalid login credentials") ||
  message.includes("invalid_credentials") ||
  message.includes("Invalid email or password") ||
  message.toLowerCase().includes("invalid login");

const isRateLimit = (message: string) =>
  message.toLowerCase().includes("rate limit") ||
  message.toLowerCase().includes("too many requests");

type FieldError = {
  empId?: string;
  password?: string;
  general?: string;
};

export default function LoginPage() {
  const router = useRouter();
  const emailDomain = process.env.NEXT_PUBLIC_EMAIL_DOMAIN ?? "company.com";
  const [empId, setEmpId] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [fieldError, setFieldError] = useState<FieldError>({});
  const { checkSession } = useAuthStore();

  function validate() {
    const errors: FieldError = {};
    if (!empId.trim()) {
      errors.empId = "Employee ID is required.";
    } else if (!/^[a-zA-Z0-9_-]+$/.test(empId.trim())) {
      errors.empId = "Use letters, numbers, hyphens, or underscores only.";
    }

    if (!password) {
      errors.password = "Password is required.";
    } else if (password.length < 6 || password.length > 72) {
      errors.password = "Password must contain 6 to 72 characters.";
    }

    setFieldError(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    setFieldError({});
    if (!validate()) return;

    setIsLoading(true);
    const params = new URLSearchParams(window.location.search);
    const redirectTo = resolveSafeInternalRedirect(
      params.get("redirectTo") ?? params.get("returnTo"),
    );
    const email = `${empId.trim().toLowerCase()}@${emailDomain}`;

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        if (isRateLimit(error.message)) {
          throw new Error("Too many attempts. Wait a minute, then try again.");
        }
        if (isInvalidCredentials(error.message)) {
          setFieldError({ password: "Employee ID or password is incorrect." });
          return;
        }
        throw new Error("Authentication failed. Please try again.");
      }

      if (!data.session) {
        throw new Error("Sign-in did not create a session. Please try again.");
      }

      await checkSession();
      if (params.get("demo") === "1") enableDashboardOsDemoMode();
      router.replace(redirectTo);
    } catch (error) {
      console.error("[Auth]", error);
      setFieldError({
        general:
          error instanceof Error
            ? error.message
            : "Authentication failed. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card className="w-full border-[color:var(--color-rule)] bg-[var(--color-surface)] text-[var(--color-ink)] shadow-[var(--shadow-float)]">
      <CardHeader className="space-y-0 p-6 pb-5 sm:p-7 sm:pb-5">
        <div className="mb-7 flex items-center gap-3 lg:hidden">
          <div className="grid h-9 w-9 place-items-center rounded-[var(--radius-control)] border border-[color:var(--color-rule-strong)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
            <BarChart3 className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-none">DashboardOS</p>
            <p className="mt-1 text-[11px] text-[var(--color-muted)]">
              Managed analytics platform
            </p>
          </div>
        </div>
        <CardTitle className="text-2xl font-semibold tracking-[-0.025em] text-[var(--color-ink)]">
          Welcome back
        </CardTitle>
        <CardDescription className="mt-2 text-sm leading-6 text-[var(--color-ink-2)]">
          Sign in to continue to your governed analytics workspace.
        </CardDescription>
        <p className="mt-4 border-l-2 border-[color:var(--color-accent)] pl-3 text-xs text-[var(--color-muted)]">
          Account format:{" "}
          <span className="font-mono text-[var(--color-ink-2)]">
            employee@{emailDomain}
          </span>
        </p>
      </CardHeader>

      <CardContent className="p-6 pt-0 sm:p-7 sm:pt-0">
        <form className="space-y-4" noValidate onSubmit={handleLogin}>
          {fieldError.general ? (
            <div
              className="flex items-start gap-2.5 rounded-[var(--radius-control)] border border-[color:var(--color-danger)] bg-destructive/10 p-3"
              role="alert"
            >
              <AlertCircle
                className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-danger)]"
                aria-hidden="true"
              />
              <p className="text-sm text-[var(--color-danger)]">
                {fieldError.general}
              </p>
            </div>
          ) : null}

          <div className="space-y-1.5 text-left">
            <Label
              htmlFor="empId"
              className="text-sm font-medium text-[var(--color-ink-2)]"
            >
              Employee ID
            </Label>
            <Input
              id="empId"
              value={empId}
              onChange={(event) => {
                setEmpId(event.target.value);
                setFieldError({});
              }}
              className="h-11 border-[color:var(--color-rule-strong)] bg-[var(--color-paper-2)] text-[var(--color-ink)] placeholder:text-[var(--color-muted)] hover:border-[color:var(--color-muted)] focus-visible:border-[color:var(--color-focus)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-focus)] focus-visible:ring-0 focus-visible:ring-offset-0 disabled:opacity-55"
              placeholder="EMP001"
              autoComplete="username"
              aria-invalid={Boolean(fieldError.empId)}
              aria-describedby={fieldError.empId ? "empId-error" : undefined}
              disabled={isLoading}
              autoFocus
            />
            <p
              id="empId-error"
              className="min-h-[1lh] text-[11px] text-[var(--color-danger)]"
            >
              {fieldError.empId ?? ""}
            </p>
          </div>

          <div className="space-y-1.5 text-left">
            <Label
              htmlFor="password"
              className="text-sm font-medium text-[var(--color-ink-2)]"
            >
              Password
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setFieldError({});
                }}
                className="h-11 border-[color:var(--color-rule-strong)] bg-[var(--color-paper-2)] pr-11 text-[var(--color-ink)] placeholder:text-[var(--color-muted)] hover:border-[color:var(--color-muted)] focus-visible:border-[color:var(--color-focus)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-focus)] focus-visible:ring-0 focus-visible:ring-offset-0 disabled:opacity-55"
                placeholder="6–72 characters"
                autoComplete="current-password"
                aria-invalid={Boolean(fieldError.password)}
                aria-describedby={
                  fieldError.password ? "password-error" : undefined
                }
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-[var(--radius-control)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[var(--color-focus)] active:text-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-55"
                aria-label={showPassword ? "Hide password" : "Show password"}
                disabled={isLoading}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
            <p
              id="password-error"
              className="min-h-[1lh] text-[11px] text-[var(--color-danger)]"
            >
              {fieldError.password ?? ""}
            </p>
          </div>

          <Button
            type="submit"
            className="h-11 w-full rounded-[var(--radius-control)] bg-[var(--color-accent)] text-sm font-semibold text-[var(--color-accent-ink)] hover:bg-[var(--color-accent-hover)] focus-visible:ring-[var(--color-focus)] active:translate-y-px disabled:cursor-not-allowed disabled:bg-[var(--color-rule-strong)] disabled:text-[var(--color-muted)] disabled:opacity-55"
            disabled={isLoading}
            aria-busy={isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            ) : (
              <Lock className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            {isLoading ? "Signing in…" : "Sign in securely"}
          </Button>

          <p className="pt-2 text-center text-xs leading-5 text-[var(--color-muted)]">
            Beta access is invite-only. Contact your workspace administrator if
            you need access.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
