'use client'

// src/app/page.tsx

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth-store'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Sparkles, Database, Download,
  ArrowRight, CheckCircle2, Zap, Shield,
  LayoutDashboard, TrendingUp, Code2,
  GitBranch, Wand2,
  // ── Fix #5 — removed unused BarChart3, RefreshCw ──────────
} from 'lucide-react'

const FEATURES = [
  {
    icon: Sparkles,
    color: 'from-blue-600 to-purple-600',
    title: 'AI-Powered Generation',
    desc: 'Describe your data or paste a JSON response. AI instantly generates the most relevant charts with correct field mappings.',
  },
  {
    icon: Database,
    color: 'from-purple-600 to-pink-600',
    title: 'Live API Integration',
    desc: 'Connect any REST API with Bearer, API Key, or Basic auth. Charts auto-refresh on configurable intervals — no ETL needed.',
  },
  {
    icon: Download,
    color: 'from-teal-600 to-cyan-600',
    title: 'Export & Deploy',
    desc: 'Download a complete React + TypeScript project ZIP with all charts, data hooks, and routing — ready to deploy instantly.',
  },
  {
    icon: GitBranch,
    color: 'from-amber-600 to-orange-600',
    title: 'Visual Auth Flow',
    desc: 'Design JWT validation and role-based access flows with a drag-and-drop node editor. Compiles to middleware config JSON.',
  },
  {
    icon: Shield,
    color: 'from-green-600 to-emerald-600',
    title: '3-Layer Security Schema',
    desc: 'AI can only modify visual styles — never data mappings or chart types. Your data wiring is always protected.',
  },
  {
    icon: Code2,
    color: 'from-rose-600 to-red-600',
    title: 'Enterprise Grade',
    desc: 'Built for legacy enterprise teams. Deep blues, gradient charts, and polished UI that passes executive reviews on day one.',
  },
]

const STEPS = [
  { n: '01', title: 'Connect Your API',  desc: 'Paste any REST endpoint URL and set auth. Live preview shows detected fields instantly.' },
  { n: '02', title: 'AI Builds Charts',  desc: 'Type "show revenue by month as a bar chart" — AI creates the widget with correct axes in seconds.' },
  { n: '03', title: 'Export & Ship',     desc: 'Download a production-ready React ZIP. Your team deploys it. No vendor lock-in, ever.' },
]

const STATS = [
  { value: '9+',  label: 'Chart Types' },
  { value: 'AI',  label: 'Gemini 2.5 Flash' },
  { value: '∞',   label: 'API Sources' },
  { value: 'ZIP', label: 'Export Format' },
]

function DashboardMockup() {
  const bars = [65, 40, 80, 55, 90, 45, 70, 60]
  return (
    <motion.div
      initial={{ opacity: 0, y: 30, rotateX: 8 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ delay: 0.3, duration: 0.7, ease: 'easeOut' }}
      className="relative w-full max-w-2xl mx-auto"
      style={{ perspective: '1000px' }}
    >
      <div className="absolute -inset-4 bg-gradient-to-r from-blue-600/20 via-purple-600/20 to-pink-600/20 rounded-3xl blur-2xl" />
      <div className="relative rounded-2xl border border-white/10 bg-gray-950/90 backdrop-blur overflow-hidden shadow-2xl">

        {/* Fake topbar */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5 bg-white/3">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
          </div>
          <div className="flex-1 mx-3 h-4 rounded-full bg-white/5 text-[9px] text-white/30 flex items-center px-3">
            analytics-ai.app/builder
          </div>
          <div className="flex gap-1">
            <div className="h-4 w-10 rounded bg-blue-600/40 text-[8px] text-blue-300 flex items-center justify-center">APIs</div>
            <div className="h-4 w-12 rounded bg-purple-600/60 text-[8px] text-white flex items-center justify-center gap-0.5">
              <Sparkles className="w-2 h-2" /> AI
            </div>
          </div>
        </div>

        {/* Fake canvas */}
        <div className="p-4 grid grid-cols-3 gap-3">

          {/* KPI Card */}
          <div className="col-span-1 rounded-xl border border-white/8 bg-white/3 p-3">
            <p className="text-[9px] text-white/40 mb-1">Total Revenue</p>
            <p className="text-xl font-bold text-white">$2.4M</p>
            <div className="flex items-center gap-1 mt-1">
              <TrendingUp className="w-2.5 h-2.5 text-green-400" />
              <span className="text-[9px] text-green-400">+18.2%</span>
            </div>
            <div className="mt-2 h-1 rounded-full bg-white/5">
              <div className="h-full w-3/4 rounded-full bg-gradient-to-r from-blue-500 to-purple-500" />
            </div>
          </div>

          {/* Bar chart */}
          <div className="col-span-2 rounded-xl border border-white/8 bg-white/3 p-3">
            <p className="text-[9px] text-white/40 mb-2">Revenue by Month</p>
            <div className="flex items-end gap-1 h-16">
              {bars.map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-sm"
                  style={{
                    height: `${h}%`,
                    background: `linear-gradient(to top, ${['#3b82f6','#8b5cf6','#06b6d4','#10b981'][i % 4]}, ${['#3b82f6','#8b5cf6','#06b6d4','#10b981'][i % 4]}88)`,
                    minHeight: 4,
                  }}
                />
              ))}
            </div>
            <div className="flex justify-between mt-1">
              {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug'].map(m => (
                <span key={m} className="text-[7px] text-white/25">{m}</span>
              ))}
            </div>
          </div>

          {/* Line chart */}
          <div className="col-span-2 rounded-xl border border-white/8 bg-white/3 p-3">
            <p className="text-[9px] text-white/40 mb-2">User Growth</p>
            <svg viewBox="0 0 200 48" className="w-full h-10">
              <defs>
                <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d="M0,42 C20,38 40,20 60,22 S100,8 120,10 S160,6 200,4" stroke="#8b5cf6" strokeWidth="1.5" fill="none" />
              <path d="M0,42 C20,38 40,20 60,22 S100,8 120,10 S160,6 200,4 L200,48 L0,48 Z" fill="url(#lg)" />
            </svg>
          </div>

          {/* Donut */}
          <div className="col-span-1 rounded-xl border border-white/8 bg-white/3 p-3 flex flex-col items-center justify-center">
            <div className="relative w-12 h-12">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                <circle cx="18" cy="18" r="12" fill="none" stroke="#1e293b" strokeWidth="5" />
                <circle cx="18" cy="18" r="12" fill="none" stroke="#06b6d4" strokeWidth="5" strokeDasharray="45 75" />
                <circle cx="18" cy="18" r="12" fill="none" stroke="#8b5cf6" strokeWidth="5" strokeDasharray="20 75" strokeDashoffset="-45" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[9px] font-bold text-white">64%</span>
              </div>
            </div>
            <p className="text-[9px] text-white/40 mt-1.5">Distribution</p>
          </div>
        </div>

        {/* AI floating button hint */}
        <div className="absolute bottom-4 right-4 flex items-center gap-1.5 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full px-2.5 py-1 shadow-lg">
          <Sparkles className="w-2.5 h-2.5 text-white" />
          <span className="text-[9px] text-white font-medium">AI Assistant</span>
        </div>
      </div>
    </motion.div>
  )
}

function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white overflow-x-hidden">

      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-gray-950/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
              <LayoutDashboard className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-base">Analytics AI</span>
            <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-400 ml-1">
              Beta
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm" className="text-white/70 hover:text-white">
                Sign In
              </Button>
            </Link>
            <Link href="/login">
              <Button size="sm" className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white border-0">
                Get Started <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden">
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-40 right-1/4 w-80 h-80 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <Badge className="mb-6 bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/10">
              <Zap className="w-3 h-3 mr-1" /> Powered by Gemini 2.5 Flash
            </Badge>
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold tracking-tight mb-6 leading-[1.1]">
              Build Enterprise{' '}
              <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                Dashboards
              </span>
              {' '}with AI
            </h1>
            <p className="text-lg text-white/60 max-w-2xl mx-auto mb-8 leading-relaxed">
              Connect any REST API. Describe what you want.{' '}
              AI generates production-ready charts with the correct field mappings —
              then exports a deployable React project in one click.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-8">
              <Link href="/login">
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white border-0 px-8 h-12 text-base font-semibold shadow-lg shadow-blue-900/30"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Start Building Free
                </Button>
              </Link>
              <Link href="/login">
                <Button
                  size="lg"
                  variant="ghost"
                  className="border-white/20 bg-transparent text-white/80 hover:bg-white/8 hover:text-white hover:border-white/40 px-8 h-12 text-base"
                >
                  View Live Demo <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-white/40">
              {['No code required', 'AI-powered chart generation', 'Export complete React app', 'Enterprise-ready UI'].map(t => (
                <div key={t} className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                  {t}
                </div>
              ))}
            </div>
          </motion.div>
          <DashboardMockup />
        </div>
      </section>

      {/* Stats */}
      <section className="py-12 border-y border-white/5 bg-white/2">
        <div className="max-w-4xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {/* ── Fix #7 — staggered delays per item ──────────── */}
          {STATS.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.4 }}
            >
              <p className="text-3xl font-extrabold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                {s.value}
              </p>
              <p className="text-sm text-white/40 mt-1">{s.label}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-3">
              Everything your team needs
            </h2>
            <p className="text-white/50 max-w-xl mx-auto">
              Built specifically for legacy enterprise organizations who need production-grade
              visual analytics without a data engineering team.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f, i) => (
              // ── Fix #6 — whileInView so cards animate on scroll ──
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, duration: 0.4 }}
                className="group relative rounded-2xl border border-white/8 bg-white/3 p-6 hover:border-white/15 hover:bg-white/5 transition-all duration-300"
              >
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-4 shadow-lg`}>
                  <f.icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="font-semibold text-base mb-2">{f.title}</h3>
                <p className="text-sm text-white/50 leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 px-6 border-t border-white/5 bg-white/2">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-3">From API to dashboard in minutes</h2>
            <p className="text-white/50">No data pipelines. No BI tools. Just your API and AI.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            <div className="hidden md:block absolute top-8 left-1/3 right-1/3 h-px bg-gradient-to-r from-blue-600/50 to-purple-600/50" />
            {STEPS.map((s, i) => (
              <motion.div
                key={s.n}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.15 }}
                viewport={{ once: true }}
                className="flex flex-col items-center text-center"
              >
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-xl font-black mb-4 shadow-lg shadow-blue-900/30 relative z-10">
                  {s.n}
                </div>
                <h3 className="font-semibold text-base mb-2">{s.title}</h3>
                <p className="text-sm text-white/50 leading-relaxed">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-blue-600/20 via-purple-600/20 to-pink-600/20 border border-white/10 p-12 text-center">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-900/30 to-purple-900/30" />
            <div className="relative z-10">
              <Wand2 className="w-12 h-12 text-purple-400 mx-auto mb-4" />
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                Ready to transform your data?
              </h2>
              <p className="text-white/60 mb-8 max-w-xl mx-auto">
                Join enterprise teams using Analytics AI to build, deploy, and maintain
                production dashboards in hours — not months.
              </p>
              <Link href="/login">
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white border-0 px-10 h-12 text-base font-semibold shadow-xl shadow-blue-900/40"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Start Building Free
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 px-6 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="w-5 h-5 rounded-md bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
            <LayoutDashboard className="w-3 h-3 text-white" />
          </div>
          <span className="font-semibold text-sm">Analytics AI</span>
        </div>
        <p className="text-xs text-white/30">
          Built by Ujjwal Dhariwal · Infinite Computer Solutions
        </p>
      </footer>
    </div>
  )
}

export default function HomePage() {
  const router          = useRouter()
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  const isLoading       = useAuthStore(s => s.isLoading)

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace('/workspaces')
    }
  }, [isAuthenticated, isLoading, router])

  if (isLoading || isAuthenticated) return null
  return <LandingPage />
}
