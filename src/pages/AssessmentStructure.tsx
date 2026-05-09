// src/pages/AssessmentStructure.tsx
import { useParams } from 'react-router-dom';
import { StructureChartStep } from '@/components/structure/StructureChartStep';

export default function AssessmentStructure() {
  const { sessionId } = useParams<{ sessionId: string }>();
  if (!sessionId) return <div className="p-8">Missing session id.</div>;
  return <StructureChartStep sessionId={sessionId} />;
}
