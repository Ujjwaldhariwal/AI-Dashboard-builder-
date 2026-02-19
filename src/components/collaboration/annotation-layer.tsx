'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageCircle, X, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'

interface Annotation {
  id: string
  x: number
  y: number
  text: string
  author: string
  timestamp: Date
  resolved: boolean
}

interface AnnotationLayerProps {
  elementId: string
}

export function AnnotationLayer({ elementId }: AnnotationLayerProps) {
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [isAdding, setIsAdding] = useState(false)
  const [newAnnotation, setNewAnnotation] = useState({ x: 0, y: 0, text: '' })
  const [selectedAnnotation, setSelectedAnnotation] = useState<string | null>(null)

  const handleAddAnnotation = () => {
    if (!newAnnotation.text.trim()) return

    const annotation: Annotation = {
      id: Date.now().toString(),
      x: newAnnotation.x,
      y: newAnnotation.y,
      text: newAnnotation.text,
      author: 'Current User',
      timestamp: new Date(),
      resolved: false
    }

    setAnnotations(prev => [...prev, annotation])
    setIsAdding(false)
    setNewAnnotation({ x: 0, y: 0, text: '' })
  }

  const handleResolve = (id: string) => {
    setAnnotations(prev => 
      prev.map(a => a.id === id ? { ...a, resolved: true } : a)
    )
  }

  const handleDelete = (id: string) => {
    setAnnotations(prev => prev.filter(a => a.id !== id))
  }

  return (
    <div className="relative">
      {/* Annotation Markers */}
      <AnimatePresence>
        {annotations.map(annotation => (
          <motion.div
            key={annotation.id}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            style={{
              position: 'absolute',
              left: `${annotation.x}px`,
              top: `${annotation.y}px`,
              zIndex: 10
            }}
            className="cursor-pointer"
            onClick={() => setSelectedAnnotation(annotation.id)}
          >
            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
              annotation.resolved 
                ? 'bg-green-500' 
                : 'bg-blue-500 animate-pulse'
            }`}>
              <MessageCircle className="w-3 h-3 text-white" />
            </div>
            
            {selectedAnnotation === annotation.id && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute left-8 top-0 w-64 bg-card border rounded-lg shadow-lg p-3"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-xs font-medium">{annotation.author}</p>
                    <p className="text-xs text-muted-foreground">
                      {annotation.timestamp.toLocaleTimeString()}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setSelectedAnnotation(null)}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
                
                <p className="text-sm mb-2">{annotation.text}</p>
                
                <div className="flex gap-2">
                  {!annotation.resolved && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleResolve(annotation.id)}
                      className="text-xs"
                    >
                      <Check className="w-3 h-3 mr-1" />
                      Resolve
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(annotation.id)}
                    className="text-xs"
                  >
                    Delete
                    </Button>
                </div>
              </motion.div>
            )}
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Add Annotation Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsAdding(!isAdding)}
        className="fixed bottom-4 right-4 z-20"
      >
        <MessageCircle className="w-4 h-4 mr-2" />
        Add Note
        {annotations.filter(a => !a.resolved).length > 0 && (
          <Badge variant="destructive" className="ml-2">
            {annotations.filter(a => !a.resolved).length}
          </Badge>
        )}
      </Button>
    </div>
  )
}
