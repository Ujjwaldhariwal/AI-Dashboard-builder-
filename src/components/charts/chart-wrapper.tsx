'use client'

import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Maximize2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ChartCustomizationPanel } from '@/components/dashboard/chart-customization-panel'
import { ChartConfig } from '@/types'

interface ChartWrapperProps {
  title: string
  children: React.ReactNode
  onRefresh?: () => void
  onMaximize?: () => void
  isLoading?: boolean
  chart?: ChartConfig
}

export function ChartWrapper({
  title,
  children,
  onRefresh,
  onMaximize,
  isLoading = false,
  chart,
}: ChartWrapperProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="h-full"
    >
      <Card className="glass-effect border-gray-700 h-full hover:shadow-neon transition-all duration-300">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-lg font-semibold text-white">
            {title}
          </CardTitle>
          <div className="flex gap-2">
            {chart && <ChartCustomizationPanel chart={chart} />}
            {onRefresh && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onRefresh}
                className="h-8 w-8 text-gray-400 hover:text-white"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            )}
            {onMaximize && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onMaximize}
                className="h-8 w-8 text-gray-400 hover:text-white"
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {children}
        </CardContent>
      </Card>
    </motion.div>
  )
}
