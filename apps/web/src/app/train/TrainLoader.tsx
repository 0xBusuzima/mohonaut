'use client';

import dynamic from 'next/dynamic';
import { LoadingScreen } from '../play/Shell';

/** The training site runs in the browser only (its progress lives on this device). */
export const TrainLoader = dynamic(() => import('./TrainingGame').then((m) => m.TrainingGame), {
  ssr: false,
  loading: () => <LoadingScreen text="Setting up the training site…" />,
});
