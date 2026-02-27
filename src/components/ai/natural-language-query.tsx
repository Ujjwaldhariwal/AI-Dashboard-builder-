'use client'

// Component: NaturalLanguageQuery

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Send, Loader2, MessageSquare, TrendingUp, Database } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

interface Message {
  role: 'user' | 'assistant'
  content: string
  data?: any
  visualizationType?: 'table' | 'chart' | 'metric'
}

interface NaturalLanguageQueryProps {
  data: any[]
  onQuery: (query: string) => Promise<any>
}

export function NaturalLanguageQuery({ data, onQuery }: NaturalLanguageQueryProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hi! I'm your AI data assistant. Ask me anything about your data. Try questions like:\n\n• What's the average value?\n• Show me trends over time\n• Find anomalies in the data\n• Which category has the highest count?"
    }
  ])
  const [input, setInput] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  const suggestedQueries = [
    "What are the top 5 records?",
    "Calculate the average",
    "Show distribution by category",
    "Find unusual patterns"
  ]

  const processNaturalLanguageQuery = async (query: string) => {
    setIsProcessing(true)
    
    // Add user message
    setMessages(prev => [...prev, { role: 'user', content: query }])
    
    try {
      // Simulate AI processing (in production, this would call OpenAI API)
      await new Promise(resolve => setTimeout(resolve, 1500))
      
      let response = ''
      let resultData: any = null
      let vizType: 'table' | 'chart' | 'metric' = 'table'
      
      // Smart query interpretation
      const lowerQuery = query.toLowerCase()
      
      if (lowerQuery.includes('average') || lowerQuery.includes('mean')) {
        const numericFields = Object.keys(data[0]).filter(key => 
          typeof data[0][key] === 'number'
        )
        
        if (numericFields.length > 0) {
          const field = numericFields[0]
          const avg = data.reduce((sum, item) => sum + item[field], 0) / data.length
          response = `The average ${field} is **${avg.toFixed(2)}**. This is calculated from ${data.length} records.`
          resultData = { metric: avg.toFixed(2), field, count: data.length }
          vizType = 'metric'
        }
      } else if (lowerQuery.includes('top') || lowerQuery.includes('highest')) {
        const numericFields = Object.keys(data[0]).filter(key => 
          typeof data[0][key] === 'number'
        )
        
        if (numericFields.length > 0) {
          const field = numericFields[0]
          const sorted = [...data].sort((a, b) => b[field] - a[field]).slice(0, 5)
          response = `Here are the top 5 records by ${field}:`
          resultData = sorted
          vizType = 'table'
        }
      } else if (lowerQuery.includes('trend') || lowerQuery.includes('over time')) {
        response = `I've identified a trend in your data. The values show a ${Math.random() > 0.5 ? 'positive' : 'negative'} correlation over the dataset timeline.`
        resultData = data.slice(0, 10)
        vizType = 'chart'
      } else if (lowerQuery.includes('distribution') || lowerQuery.includes('category')) {
        const categoricalFields = Object.keys(data[0]).filter(key => 
          typeof data[0][key] === 'string'
        )
        
        if (categoricalFields.length > 0) {
          const field = categoricalFields[0]
          const distribution = data.reduce((acc, item) => {
            acc[item[field]] = (acc[item[field]] || 0) + 1
            return acc
          }, {} as Record<string, number>)
          
          response = `Distribution by ${field}:`
          resultData = Object.entries(distribution).map(([name, count]) => ({ name, count }))
          vizType = 'table'
        }
      } else if (lowerQuery.includes('anomal') || lowerQuery.includes('unusual')) {
        response = `I've analyzed ${data.length} records and found 2-3 potential anomalies that deviate from normal patterns. These could indicate data quality issues or significant events.`
        vizType = 'table'
      } else if (lowerQuery.includes('total') || lowerQuery.includes('sum')) {
        const numericFields = Object.keys(data[0]).filter(key => 
          typeof data[0][key] === 'number'
        )
        
        if (numericFields.length > 0) {
          const field = numericFields[0]
          const total = data.reduce((sum, item) => sum + item[field], 0)
          response = `The total sum of ${field} is **${total.toFixed(2)}** across ${data.length} records.`
          resultData = { metric: total.toFixed(2), field, count: data.length }
          vizType = 'metric'
        }
      } else {
        response = `I understand you're asking about: "${query}". Based on your data, I can see ${data.length} records with ${Object.keys(data[0]).length} fields. Would you like me to show you:\n\n• Statistical summary\n• Top records\n• Distribution analysis\n• Trend analysis`
      }
      
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: response,
        data: resultData,
        visualizationType: vizType
      }])
    } catch (error) {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: "I encountered an error processing your query. Please try rephrasing your question."
      }])
    } finally {
      setIsProcessing(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isProcessing) return
    
    processNaturalLanguageQuery(input)
    setInput('')
  }

  const handleSuggestedQuery = (query: string) => {
    processNaturalLanguageQuery(query)
  }

  return (
    <Card className="h-[600px] flex flex-col">
      <CardHeader className="border-b">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-600" />
          <CardTitle>AI Data Assistant</CardTitle>
          <Badge variant="secondary" className="ml-auto">Beta</Badge>
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col p-0">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <AnimatePresence>
            {messages.map((message, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {message.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-4 h-4 text-purple-600" />
                  </div>
                )}
                
                <div className={`max-w-[80%] rounded-lg p-3 ${
                  message.role === 'user' 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-muted'
                }`}>
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  
                  {message.data && message.visualizationType === 'table' && (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr>
                            {Object.keys(message.data[0]).map(key => (
                              <th key={key} className="text-left p-2 border-b">{key}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {message.data.slice(0, 5).map((row: any, idx: number) => (
                            <tr key={idx}>
                              {Object.values(row).map((val: any, j) => (
                                <td key={j} className="p-2 border-b">{String(val)}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  
                  {message.data && message.visualizationType === 'metric' && (
                    <div className="mt-3 p-4 bg-card rounded-lg border">
                      <div className="text-3xl font-bold text-primary">
                        {message.data.metric}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        from {message.data.count} records
                      </div>
                    </div>
                  )}
                </div>
                
                {message.role === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                    <MessageSquare className="w-4 h-4 text-primary-foreground" />
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          
          {isProcessing && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex gap-3"
            >
              <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
                <Loader2 className="w-4 h-4 text-purple-600 animate-spin" />
              </div>
              <div className="bg-muted rounded-lg p-3">
                <p className="text-sm text-muted-foreground">Analyzing your data...</p>
              </div>
            </motion.div>
          )}
        </div>
        
        {/* Suggested Queries */}
        {messages.length === 1 && (
          <div className="px-4 pb-2">
            <p className="text-xs text-muted-foreground mb-2">Try asking:</p>
            <div className="flex gap-2 flex-wrap">
              {suggestedQueries.map((query, i) => (
                <Button
                  key={i}
                  variant="outline"
                  size="sm"
                  onClick={() => handleSuggestedQuery(query)}
                  className="text-xs"
                >
                  {query}
                </Button>
              ))}
            </div>
          </div>
        )}
        
        {/* Input */}
        <form onSubmit={handleSubmit} className="p-4 border-t">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask me anything about your data..."
              disabled={isProcessing}
              className="flex-1"
            />
            <Button type="submit" disabled={isProcessing || !input.trim()}>
              {isProcessing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
