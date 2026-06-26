'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import * as VisuallyHidden from '@radix-ui/react-visually-hidden'
import { AnimatePresence, motion } from 'framer-motion'
import {
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Database,
  LayoutDashboard,
  Sparkles,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

const STORAGE_KEY = 'analytics-ai-onboarded'

const STEPS = [
  {
    icon: LayoutDashboard,
    color: 'from-blue-600 to-purple-600',
    title: 'Welcome to DashboardOS',
    desc: 'Start from the governed DB-to-dashboard admin flow. The older widget builder is now a legacy fallback.',
    cta: 'Get Started',
    tip: null,
  },
  {
    icon: Database,
    color: 'from-purple-600 to-pink-600',
    title: 'Step 1 - Connect a database',
    desc: 'Create a tenant project, connect a Postgres data source, and introspect schema metadata.',
    cta: 'Open Data Sources',
    tip: 'Use project-scoped read-only credentials.',
  },
  {
    icon: BarChart3,
    color: 'from-green-600 to-teal-600',
    title: 'Step 2 - Publish dashboards',
    desc: 'Compose governed chart configs into versioned read-only client dashboard releases.',
    cta: 'Open Publishing',
    tip: 'Published versions power the client runtime.',
  },
  {
    icon: Sparkles,
    color: 'from-amber-500 to-orange-600',
    title: "You're all set!",
    desc: 'Use the admin command center for tenants, data sources, semantic datasets, charts, and publishing.',
    cta: 'Open DashboardOS',
    tip: null,
  },
]

export function OnboardingWizard() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    const done = localStorage.getItem(STORAGE_KEY)
    if (!done) setOpen(true)
  }, [])

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'true')
    setOpen(false)
  }

  const handleCTA = () => {
    if (step < STEPS.length - 1) {
      setStep(current => current + 1)
      return
    }

    dismiss()
    router.push('/admin')
  }

  const handleStepCTA = (idx: number) => {
    if (idx === 1) {
      dismiss()
      router.push('/admin/data-sources')
      return
    }

    if (idx === 2) {
      dismiss()
      router.push('/admin/publishing')
      return
    }

    handleCTA()
  }

  const current = STEPS[step]
  const Icon = current.icon

  return (
    <Dialog open={open} onOpenChange={value => !value && dismiss()}>
      <DialogContent className="max-w-md overflow-hidden p-0 gap-0">
        <VisuallyHidden.Root>
          <DialogTitle>Onboarding - {current.title}</DialogTitle>
        </VisuallyHidden.Root>

        <button
          onClick={dismiss}
          className="absolute right-3 top-3 z-20 rounded-full p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.2 }}
          >
            <div className={`bg-gradient-to-br ${current.color} p-8 text-center text-white`}>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/25 shadow-lg ring-1 ring-white/30 backdrop-blur-sm">
                <Icon className="h-8 w-8 text-white drop-shadow-lg" />
              </div>
              <h2 className="mb-2 text-xl font-bold">{current.title}</h2>
              <p className="text-sm leading-relaxed text-white/85">{current.desc}</p>
              {current.tip ? (
                <div className="mt-3 rounded-lg border border-white/10 bg-white/15 px-3 py-1.5 font-mono text-xs text-white/95">
                  {current.tip}
                </div>
              ) : null}
            </div>

            <div className="bg-card p-5">
              <div className="mb-4 flex items-center justify-center gap-1.5">
                {STEPS.map((item, index) => (
                  <button
                    key={item.title}
                    onClick={() => setStep(index)}
                    className={`h-1.5 rounded-full transition-all ${
                      index === step ? 'w-6 bg-primary' : 'w-1.5 bg-muted'
                    }`}
                    aria-label={`Go to step ${index + 1}`}
                  />
                ))}
              </div>

              <div className="flex gap-3">
                <Button variant="ghost" onClick={dismiss} className="flex-1">
                  Skip
                </Button>
                <Button onClick={() => handleStepCTA(step)} className="flex-1 gap-2">
                  {current.cta}
                  {step < STEPS.length - 1 ? <ChevronRight className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  )
}
