import React from 'react';
import { createRoot } from 'react-dom/client';
import PipelineApp from './components/PipelineApp';
import './styles/globals.css';

const root = createRoot(document.getElementById('root')!);
root.render(<React.StrictMode><PipelineApp /></React.StrictMode>);
