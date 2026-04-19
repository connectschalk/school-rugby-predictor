'use client'

import { forwardRef } from 'react'
import ExportPredictionCard from '@/components/export/ExportPredictionCard'

type PredictedVsActualCardProps = {
  homeTeamName: string
  awayTeamName: string
  predictedText: string
  actualText: string
  differenceText: string
  date: string
  format?: 'square' | 'portrait'
  homeTeamLogo?: string
  awayTeamLogo?: string
}

const PredictedVsActualCard = forwardRef<HTMLDivElement, PredictedVsActualCardProps>(
  function PredictedVsActualCard(props, ref) {
    return <ExportPredictionCard ref={ref} variant="predicted-vs-actual" {...props} />
  }
)

export default PredictedVsActualCard
