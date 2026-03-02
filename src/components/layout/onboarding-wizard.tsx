'use client'

// src/components/layout/onboarding-wizard.tsx

import { useState, useEffect } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { motion, AnimatePresence } from 'framer-motion'
import {
    LayoutDashboard, Database, BarChart3,
    ChevronRight, X, CheckCircle2, Sparkles,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { DialogTitle } from '@/components/ui/dialog'
import * as VisuallyHidden from '@radix-ui/react-visually-hidden'

const STORAGE_KEY = 'analytics-ai-onboarded'

const STEPS = [
    {
        icon: LayoutDashboard,
        color: 'from-blue-600 to-purple-600',
        title: 'Welcome to Analytics AI',
        desc: 'Build stunning, data-driven dashboards from any API in minutes — no code needed.',
        cta: 'Get Started',
        tip: null,
    },
    {
        icon: Database,
        color: 'from-purple-600 to-pink-600',
        title: 'Step 1 — Connect an API',
        desc: 'Go to API Config and paste any REST endpoint URL. We\'ll detect the schema automatically.',
        cta: 'Go to API Config →',
        tip: 'Try: jsonplaceholder.typicode.com/users',
    },
    {
        icon: BarChart3,
        color: 'from-green-600 to-teal-600',
        title: 'Step 2 — Add Widgets',
        desc: 'Click "Add Widget" in the Builder or use Magic Auto-Build to generate charts from your data instantly.',
        cta: 'Open Builder →',
        tip: 'Magic Auto-Build generates 4-6 charts in one click.',
    },
    {
        icon: Sparkles,
        color: 'from-amber-500 to-orange-600',
        title: 'You\'re all set!',
        desc: 'Your dashboards auto-refresh, can be shared via link, or exported as a full React project.',
        cta: 'Start Building',
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
            setStep(s => s + 1)
        } else {
            dismiss()
            router.push('/workspaces')
        }
    }

    const handleStepCTA = (idx: number) => {
        if (idx === 1) { dismiss(); router.push('/api-config') }
        if (idx === 2) { dismiss(); router.push('/builder') }
        else handleCTA()
    }

    const current = STEPS[step]
    const Icon = current.icon

    return (
        <Dialog open={open} onOpenChange={v => !v && dismiss()}>
            <DialogContent className="max-w-md p-0 overflow-hidden gap-0">

                <VisuallyHidden.Root>
                    <DialogTitle>Onboarding — {current.title}</DialogTitle>
                </VisuallyHidden.Root>

                {/* Close */}
                <button
                    onClick={dismiss}
                    className="absolute right-3 top-3 z-10 p-1.5 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>

                <AnimatePresence mode="wait">
                    <motion.div
                        key={step}
                        initial={{ opacity: 0, x: 24 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -24 }}
                        transition={{ duration: 0.2 }}
                    >
                        {/* Hero */}
                        <div className={`bg-gradient-to-br ${current.color} p-8 text-white text-center`}>
                            <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-4">
                                <Icon className="w-8 h-8 text-white" />
                            </div>
                            <h2 className="text-xl font-bold mb-2">{current.title}</h2>
                            <p className="text-sm text-white/80 leading-relaxed">{current.desc}</p>
                            {current.tip && (
                                <div className="mt-3 px-3 py-1.5 bg-white/10 rounded-lg text-xs font-mono text-white/90">
                                    💡 {current.tip}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-5">
                            {/* Step dots */}
                            <div className="flex items-center justify-center gap-1.5 mb-4">
                                {STEPS.map((_, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setStep(i)}
                                        className={`w-1.5 h-1.5 rounded-full transition-all ${i === step ? 'w-4 bg-primary' : 'bg-muted-foreground/30'
                                            }`}
                                    />
                                ))}
                            </div>

                            <div className="flex items-center gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-muted-foreground"
                                    onClick={dismiss}
                                >
                                    Skip
                                </Button>
                                <Button
                                    className="flex-1 gap-2"
                                    onClick={() => handleStepCTA(step)}
                                >
                                    {step === STEPS.length - 1
                                        ? <><CheckCircle2 className="w-4 h-4" />{current.cta}</>
                                        : <>{current.cta}<ChevronRight className="w-4 h-4" /></>
                                    }
                                </Button>
                            </div>
                        </div>
                    </motion.div>
                </AnimatePresence>
            </DialogContent>
        </Dialog>
    )
}
