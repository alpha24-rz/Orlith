'use client'

import React, { useState, useEffect, useRef } from 'react'
import {
  Brain, Play, Pause, HelpCircle, Activity, Sparkles, RefreshCw,
  ArrowRight, Search, Plus, Minus, CheckCircle, Database,
  Sliders, BookOpen, Layers, Code, Zap, AlertCircle, FileText, Check
} from 'lucide-react'
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  LineChart,
  Line,
  Cell
} from 'recharts'

// ==========================================
// STATIC/HELPERS DATA FOR NLP VISUALIZER
// ==========================================

const SAMPLE_SENTENCES = [
  "DocuMind AI provides lightning-fast search capabilities!",
  "Machine learning models can analyze large document sets.",
  "RAG systems retrieve relevant context for chatbots.",
  "Kecerdasan buatan memproses data teks bahasa alami."
]

const ENGLISH_STOPWORDS = new Set([
  "i", "me", "my", "myself", "we", "our", "ours", "ourselves", "you", "your", "yours", 
  "yourself", "yourselves", "he", "him", "his", "himself", "she", "her", "hers", "herself", 
  "it", "its", "itself", "they", "them", "their", "theirs", "themselves", "what", "which", 
  "who", "whom", "this", "that", "these", "those", "am", "is", "are", "was", "were", "be", 
  "been", "being", "have", "has", "had", "having", "do", "does", "did", "doing", "a", "an", 
  "the", "and", "but", "if", "or", "because", "as", "until", "while", "of", "at", "by", 
  "for", "with", "about", "against", "between", "into", "through", "during", "before", 
  "after", "above", "below", "to", "from", "up", "down", "in", "out", "on", "off", "over", 
  "under", "again", "further", "then", "once", "here", "there", "when", "where", "why", 
  "how", "all", "any", "both", "each", "few", "more", "most", "other", "some", "such", 
  "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very", "s", "t", "can", 
  "will", "just", "don", "should", "now"
])

const INDONESIAN_STOPWORDS = new Set([
  "ada", "adalah", "adanya", "adapun", "akan", "akibat", "akibatnya", "aku", "maka",
  "dan", "dari", "dengan", "di", "dia", "ini", "itu", "jika", "juga", "kami", "kita",
  "ke", "oleh", "pada", "untuk", "yang", "tidak", "bisa", "dapat", "adalah", "ialah"
])

const LEMMA_MAP: { [key: string]: { lemma: string, stem: string, pos: string, posDesc: string } } = {
  "documind": { lemma: "documind", stem: "documind", pos: "NNP", posDesc: "Proper Noun" },
  "ai": { lemma: "ai", stem: "ai", pos: "NNP", posDesc: "Proper Noun" },
  "provides": { lemma: "provide", stem: "provid", pos: "VBZ", posDesc: "Verb, 3rd person singular present" },
  "lightning-fast": { lemma: "lightning-fast", stem: "lightning-fast", pos: "JJ", posDesc: "Adjective" },
  "search": { lemma: "search", stem: "search", pos: "NN", posDesc: "Noun, singular" },
  "capabilities": { lemma: "capability", stem: "capabl", pos: "NNS", posDesc: "Noun, plural" },
  "machine": { lemma: "machine", stem: "machin", pos: "NN", posDesc: "Noun, singular" },
  "learning": { lemma: "learn", stem: "learn", pos: "VBG", posDesc: "Verb, gerund" },
  "models": { lemma: "model", stem: "model", pos: "NNS", posDesc: "Noun, plural" },
  "can": { lemma: "can", stem: "can", pos: "MD", posDesc: "Modal Verb" },
  "analyze": { lemma: "analyze", stem: "analyz", pos: "VB", posDesc: "Verb, base form" },
  "large": { lemma: "large", stem: "larg", pos: "JJ", posDesc: "Adjective" },
  "document": { lemma: "document", stem: "document", pos: "NN", posDesc: "Noun, singular" },
  "sets": { lemma: "set", stem: "set", pos: "NNS", posDesc: "Noun, plural" },
  "rag": { lemma: "rag", stem: "rag", pos: "NNP", posDesc: "Proper Noun" },
  "systems": { lemma: "system", stem: "system", pos: "NNS", posDesc: "Noun, plural" },
  "retrieve": { lemma: "retrieve", stem: "retriev", pos: "VBP", posDesc: "Verb, non-3rd person present" },
  "relevant": { lemma: "relevant", stem: "relev", pos: "JJ", posDesc: "Adjective" },
  "context": { lemma: "context", stem: "context", pos: "NN", posDesc: "Noun, singular" },
  "for": { lemma: "for", stem: "for", pos: "IN", posDesc: "Preposition" },
  "chatbots": { lemma: "chatbot", stem: "chatbot", pos: "NNS", posDesc: "Noun, plural" },
  "kecerdasan": { lemma: "cerdas", stem: "cerdas", pos: "NN", posDesc: "Nomina (Kata Benda)" },
  "buatan": { lemma: "buat", stem: "buat", pos: "JJ", posDesc: "Adjektiva (Kata Sifat)" },
  "memproses": { lemma: "proses", stem: "proses", pos: "VB", posDesc: "Verba (Kata Kerja)" },
  "data": { lemma: "data", stem: "data", pos: "NN", posDesc: "Nomina (Kata Benda)" },
  "teks": { lemma: "teks", stem: "teks", pos: "NN", posDesc: "Nomina (Kata Benda)" },
  "bahasa": { lemma: "bahasa", stem: "bahasa", pos: "NN", posDesc: "Nomina (Kata Benda)" },
  "alami": { lemma: "alam", stem: "alam", pos: "JJ", posDesc: "Adjektiva (Kata Sifat)" }
}

const WORD_EMBEDDINGS: { [key: string]: { x: number, y: number, vector: number[], category: string } } = {
  "documind": { x: -0.75, y: 0.8, vector: [0.85, 0.45, -0.22, 0.91, 0.05, 0.12, 0.67, 0.39], category: "Technology" },
  "ai": { x: -0.85, y: 0.7, vector: [0.95, 0.35, -0.15, 0.88, 0.12, 0.08, 0.72, 0.45], category: "Technology" },
  "rag": { x: -0.65, y: 0.6, vector: [0.78, 0.50, -0.30, 0.82, -0.05, 0.18, 0.59, 0.31], category: "Technology" },
  "systems": { x: -0.5, y: 0.5, vector: [0.62, 0.58, -0.11, 0.75, -0.20, 0.22, 0.44, 0.28], category: "Technology" },
  "provides": { x: 0.1, y: -0.1, vector: [0.12, -0.08, 0.45, 0.22, 0.65, 0.11, -0.15, 0.34], category: "Actions" },
  "retrieve": { x: 0.2, y: 0.1, vector: [0.25, 0.15, 0.55, 0.31, 0.71, 0.25, -0.05, 0.42], category: "Actions" },
  "analyze": { x: -0.1, y: 0.2, vector: [0.33, 0.21, 0.49, 0.45, 0.59, 0.19, 0.05, 0.39], category: "Actions" },
  "memproses": { x: 0.05, y: 0.15, vector: [0.28, 0.18, 0.51, 0.38, 0.62, 0.20, -0.02, 0.40], category: "Actions" },
  "search": { x: -0.4, y: -0.3, vector: [0.55, 0.72, 0.15, 0.68, -0.12, 0.55, 0.39, 0.61], category: "Search & Context" },
  "context": { x: -0.3, y: -0.4, vector: [0.49, 0.65, 0.22, 0.59, -0.08, 0.48, 0.31, 0.55], category: "Search & Context" },
  "data": { x: -0.2, y: -0.2, vector: [0.42, 0.60, 0.18, 0.55, -0.15, 0.41, 0.25, 0.49], category: "Search & Context" },
  "teks": { x: -0.25, y: -0.35, vector: [0.45, 0.63, 0.20, 0.57, -0.12, 0.44, 0.28, 0.52], category: "Search & Context" },
  "lightning-fast": { x: 0.7, y: 0.7, vector: [-0.15, -0.65, 0.85, -0.21, 0.39, -0.77, -0.59, -0.81], category: "Modifiers" },
  "large": { x: 0.6, y: 0.5, vector: [-0.08, -0.55, 0.71, -0.15, 0.31, -0.69, -0.51, -0.72], category: "Modifiers" },
  "relevant": { x: 0.5, y: 0.6, vector: [-0.02, -0.59, 0.78, -0.10, 0.35, -0.72, -0.55, -0.77], category: "Modifiers" },
  "alami": { x: 0.55, y: 0.45, vector: [-0.05, -0.52, 0.73, -0.12, 0.33, -0.67, -0.53, -0.70], category: "Modifiers" }
}

const CATEGORY_COLORS: { [key: string]: string } = {
  "Technology": "#818CF8",
  "Actions": "#34D399",
  "Search & Context": "#F59E0B",
  "Modifiers": "#EC4899",
  "Other": "#9CA3AF"
}

function getDeterministicWordVector(word: string): { x: number, y: number, vector: number[], category: string } {
  const cleanWord = word.toLowerCase().replace(/[^a-z]/g, '')
  if (WORD_EMBEDDINGS[cleanWord]) return WORD_EMBEDDINGS[cleanWord]
  
  let hash = 0
  for (let i = 0; i < cleanWord.length; i++) {
    hash = cleanWord.charCodeAt(i) + ((hash << 5) - hash)
  }
  
  const x = Math.sin(hash) * 0.8
  const y = Math.cos(hash) * 0.8
  const vector = Array.from({ length: 8 }, (_, idx) => {
    const val = Math.sin(hash + idx * 1.5)
    return parseFloat(val.toFixed(2))
  })
  
  return { x, y, vector, category: "Other" }
}

function calculateCosineSimilarity(v1: number[], v2: number[]): number {
  if (v1.length !== v2.length || v1.length === 0) return 0
  let dotProduct = 0
  let norm1 = 0
  let norm2 = 0
  for (let i = 0; i < v1.length; i++) {
    dotProduct += v1[i] * v2[i]
    norm1 += v1[i] * v1[i]
    norm2 += v2[i] * v2[i]
  }
  if (norm1 === 0 || norm2 === 0) return 0
  return parseFloat((dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2))).toFixed(4))
}

// ==========================================
// RAG CONTEXT SEARCH METADATA
// ==========================================

const RAG_PRESETS = [
  { text: "Seberapa cepat pencarian DocuMind?", label: "Pertanyaan A: Kecepatan" },
  { text: "Bagaimana cara kerja neuron dalam JST?", label: "Pertanyaan B: Jaringan Syaraf" },
  { text: "Apa fungsi sistem RAG dalam chatbot?", label: "Pertanyaan C: Konsep RAG" }
]

const RAG_CHUNKS = [
  {
    id: 'chunk-a',
    title: 'Dokumen A: Performa & Kecepatan',
    text: 'DocuMind AI menyediakan pencarian semantik berkecepatan tinggi dengan ChromaDB lokal.',
    vector: [0.88, 0.45, -0.20, 0.90, 0.10, 0.05, 0.70, 0.40],
    category: 'Technology'
  },
  {
    id: 'chunk-b',
    title: 'Dokumen B: Teori Jaringan Syaraf',
    text: 'Jaringan syaraf tiruan memproses data dengan meneruskan sinyal melalui bobot sinapsis.',
    vector: [-0.10, -0.60, 0.80, -0.20, 0.35, -0.75, -0.55, -0.80],
    category: 'Modifiers'
  },
  {
    id: 'chunk-c',
    title: 'Dokumen C: Konsep RAG',
    text: 'Sistem RAG mengambil konteks relevan dari dokumen untuk diberikan ke chatbot.',
    vector: [0.45, 0.65, 0.20, 0.55, -0.10, 0.45, 0.30, 0.50],
    category: 'Search & Context'
  }
]

// ==========================================
// DEEP JST PLAYGROUND (TENSORFLOW STYLE)
// ==========================================

type DatasetType = 'circle' | 'xor' | 'gaussian' | 'spiral'

interface DeepWeights {
  W: number[][][] // layer index -> neuron out -> neuron in
  b: number[][]   // layer index -> neuron out
}

interface FeatureConfig {
  x1: boolean
  x2: boolean
  x1_sq: boolean
  x2_sq: boolean
  x1_x2: boolean
  sin_x1: boolean
  sin_x2: boolean
}

const generateDataset = (type: DatasetType, noise: number): { x1: number, x2: number, y: number }[] => {
  const points = []
  const numPoints = 120
  
  if (type === 'circle') {
    for (let i = 0; i < numPoints; i++) {
      const r = i < numPoints / 2 ? Math.random() * 0.4 : Math.random() * 0.45 + 0.65
      const angle = Math.random() * 2 * Math.PI
      const x1 = r * Math.cos(angle) + (Math.random() - 0.5) * noise * 0.15
      const x2 = r * Math.sin(angle) + (Math.random() - 0.5) * noise * 0.15
      const y = i < numPoints / 2 ? 0 : 1
      points.push({ x1, x2, y })
    }
  } else if (type === 'xor') {
    for (let i = 0; i < numPoints; i++) {
      const x1 = (Math.random() - 0.5) * 2.4
      const x2 = (Math.random() - 0.5) * 2.4
      const nx1 = x1 + (Math.random() - 0.5) * noise * 0.15
      const nx2 = x2 + (Math.random() - 0.5) * noise * 0.15
      const y = (x1 * x2 >= 0) ? 1 : 0
      points.push({ x1: nx1, x2: nx2, y })
    }
  } else if (type === 'gaussian') {
    for (let i = 0; i < numPoints; i++) {
      const isClass0 = i < numPoints / 2
      const cx = isClass0 ? -0.6 : 0.6
      const cy = isClass0 ? -0.6 : 0.6
      const x1 = cx + (Math.random() - 0.5) * 0.65 + (Math.random() - 0.5) * noise * 0.15
      const x2 = cy + (Math.random() - 0.5) * 0.65 + (Math.random() - 0.5) * noise * 0.15
      const y = isClass0 ? 0 : 1
      points.push({ x1, x2, y })
    }
  } else if (type === 'spiral') {
    for (let i = 0; i < numPoints; i++) {
      const isClass0 = i % 2 === 0
      const y = isClass0 ? 0 : 1
      const r = (i / numPoints) * 1.2
      const angle = (i / numPoints) * 2.8 * Math.PI + (isClass0 ? 0 : Math.PI)
      const x1 = r * Math.sin(angle) + (Math.random() - 0.5) * noise * 0.12
      const x2 = r * Math.cos(angle) + (Math.random() - 0.5) * noise * 0.12
      points.push({ x1, x2, y })
    }
  }
  return points
}

export default function VisualizerPage() {
  const [activeTab, setActiveTab] = useState<'nlp' | 'rag' | 'playground'>('playground')
  
  // ==========================================
  // NLP STATES & FUNCTIONS
  // ==========================================
  const [nlpInput, setNlpInput] = useState(SAMPLE_SENTENCES[0])
  const [removeStopwords, setRemoveStopwords] = useState(false)
  const [selectedWordA, setSelectedWordA] = useState('ai')
  const [selectedWordB, setSelectedWordB] = useState('documind')
  
  const getTokens = (text: string) => {
    return text.split(/\s+/).map(word => {
      const clean = word.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
      return {
        raw: word,
        clean: clean,
        isStopword: ENGLISH_STOPWORDS.has(clean) || INDONESIAN_STOPWORDS.has(clean)
      }
    }).filter(t => t.clean.length > 0)
  }

  const tokens = getTokens(nlpInput)
  const availableWords = Array.from(new Set(tokens.map(t => t.clean)))
  
  useEffect(() => {
    if (availableWords.length > 0) {
      if (!availableWords.includes(selectedWordA)) {
        setSelectedWordA(availableWords[0])
      }
      if (!availableWords.includes(selectedWordB)) {
        setSelectedWordB(availableWords[Math.min(1, availableWords.length - 1)])
      }
    }
  }, [nlpInput])

  const wordAVecObj = getDeterministicWordVector(selectedWordA)
  const wordBVecObj = getDeterministicWordVector(selectedWordB)
  const similarityScore = calculateCosineSimilarity(wordAVecObj.vector, wordBVecObj.vector)

  const scatterData = availableWords.map(word => {
    const vecData = getDeterministicWordVector(word)
    return {
      name: word,
      x: vecData.x,
      y: vecData.y,
      category: vecData.category
    }
  })

  // ==========================================
  // RAG CONTEXT SEARCH STATES & LOGIC
  // ==========================================
  const [ragInput, setRagInput] = useState(RAG_PRESETS[0].text)
  const [activeEncoderAnimation, setActiveEncoderAnimation] = useState(false)

  const getQueryVector = (queryText: string) => {
    const clean = queryText.trim().toLowerCase()
    if (clean.includes("cepat") || clean.includes("performa") || clean.includes("speed")) {
      return [0.85, 0.40, -0.18, 0.88, 0.12, 0.08, 0.68, 0.42]
    }
    if (clean.includes("neuron") || clean.includes("jst") || clean.includes("syaraf") || clean.includes("neural")) {
      return [-0.08, -0.55, 0.78, -0.18, 0.32, -0.70, -0.52, -0.78]
    }
    if (clean.includes("rag") || clean.includes("konteks") || clean.includes("chatbot") || clean.includes("retrieval")) {
      return [0.42, 0.60, 0.18, 0.52, -0.12, 0.42, 0.28, 0.48]
    }

    const words = queryText.split(/\s+/).map(w => w.toLowerCase().replace(/[^a-z]/g, '')).filter(w => w.length > 0)
    if (words.length === 0) return [0, 0, 0, 0, 0, 0, 0, 0]
    
    let vec = Array(8).fill(0)
    words.forEach(w => {
      const wordVec = getDeterministicWordVector(w).vector
      for (let i = 0; i < 8; i++) {
        vec[i] += wordVec[i]
      }
    })
    
    let norm = 0
    for (let i = 0; i < 8; i++) {
      vec[i] = vec[i] / words.length
      norm += vec[i] * vec[i]
    }
    norm = Math.sqrt(norm)
    if (norm > 0) {
      for (let i = 0; i < 8; i++) {
        vec[i] = parseFloat((vec[i] / norm).toFixed(2))
      }
    }
    return vec
  }

  const queryVector = getQueryVector(ragInput)
  const ragSimilarities = RAG_CHUNKS.map(chunk => ({
    ...chunk,
    similarity: calculateCosineSimilarity(queryVector, chunk.vector)
  }))
  const winningChunk = [...ragSimilarities].sort((a, b) => b.similarity - a.similarity)[0]

  useEffect(() => {
    setActiveEncoderAnimation(true)
    const timer = setTimeout(() => setActiveEncoderAnimation(false), 1200)
    return () => clearTimeout(timer)
  }, [ragInput])

  // ==========================================
  // DEEP JST PLAYGROUND STATES & LOGIC
  // ==========================================
  const [selectedDataset, setSelectedDataset] = useState<DatasetType>('xor')
  const [datasetNoise, setDatasetNoise] = useState<number>(10)
  
  const [activeFeatures, setActiveFeatures] = useState<FeatureConfig>({
    x1: true,
    x2: true,
    x1_sq: false,
    x2_sq: false,
    x1_x2: false,
    sin_x1: false,
    sin_x2: false
  })
  
  const [hiddenLayers, setHiddenLayers] = useState<number[]>([4, 2]) // hidden layer sizes (max 4 layers, sizes 1-6)
  const [learningRate, setLearningRate] = useState<number>(0.1)
  const [activationType, setActivationType] = useState<string>('tanh')
  const [regularization, setRegularization] = useState<string>('None')

  const [epochPlayground, setEpochPlayground] = useState<number>(0)
  const [playLossHistory, setPlayLossHistory] = useState<{ epoch: number, loss: number }[]>([])
  const [isPlaygroundTraining, setIsPlaygroundTraining] = useState<boolean>(false)
  const [hoveredDeepNeuron, setHoveredDeepNeuron] = useState<any | null>(null)
  
  const playgroundInterval = useRef<NodeJS.Timeout | null>(null)

  // Current dataset points
  const [datasetPoints, setDatasetPoints] = useState<{ x1: number, x2: number, y: number }[]>([])

  // Re-generate dataset points
  useEffect(() => {
    setDatasetPoints(generateDataset(selectedDataset, datasetNoise))
    handlePlaygroundReset()
  }, [selectedDataset, datasetNoise])

  const activeFeaturesList = Object.keys(activeFeatures).filter(f => activeFeatures[f as keyof FeatureConfig])
  const layerSizes = [activeFeaturesList.length, ...hiddenLayers, 1]

  const [deepWeights, setDeepWeights] = useState<DeepWeights>({ W: [], b: [] })

  // Initialize weights
  const initializeDeepWeights = (sizes: number[]) => {
    const W: number[][][] = []
    const b: number[][] = []
    
    for (let l = 0; l < sizes.length - 1; l++) {
      const inSize = sizes[l]
      const outSize = sizes[l+1]
      const layerW: number[][] = []
      const layerB: number[] = []
      
      const scale = Math.sqrt(2 / inSize)
      for (let o = 0; o < outSize; o++) {
        const neuronW: number[] = []
        for (let i = 0; i < inSize; i++) {
          neuronW.push((Math.random() - 0.5) * scale)
        }
        layerW.push(neuronW)
        layerB.push((Math.random() - 0.5) * 0.1)
      }
      W.push(layerW)
      b.push(layerB)
    }
    return { W, b }
  }

  // Effect to re-initialize weights when sizes change
  useEffect(() => {
    setDeepWeights(initializeDeepWeights(layerSizes))
    setEpochPlayground(0)
    setPlayLossHistory([])
  }, [hiddenLayers, activeFeatures])

  // Reset Playground
  const handlePlaygroundReset = () => {
    if (playgroundInterval.current) clearInterval(playgroundInterval.current)
    setIsPlaygroundTraining(false)
    setDeepWeights(initializeDeepWeights(layerSizes))
    setEpochPlayground(0)
    setPlayLossHistory([])
    setHoveredDeepNeuron(null)
  }

  const computeFeatures = (x1: number, x2: number) => {
    const vals: number[] = []
    if (activeFeatures.x1) vals.push(x1)
    if (activeFeatures.x2) vals.push(x2)
    if (activeFeatures.x1_sq) vals.push(x1 * x1)
    if (activeFeatures.x2_sq) vals.push(x2 * x2)
    if (activeFeatures.x1_x2) vals.push(x1 * x2)
    if (activeFeatures.sin_x1) vals.push(Math.sin(x1))
    if (activeFeatures.sin_x2) vals.push(Math.sin(x2))
    return vals
  }

  const activate = (z: number, type: string) => {
    if (type === 'sigmoid') return 1 / (1 + Math.exp(-z))
    if (type === 'tanh') return Math.tanh(z)
    if (type === 'relu') return Math.max(0, z)
    return z // linear
  }

  const activateDerivative = (a: number, type: string) => {
    if (type === 'sigmoid') return a * (1 - a)
    if (type === 'tanh') return 1 - a * a
    if (type === 'relu') return a > 0 ? 1 : 0
    return 1 // linear
  }

  const runDeepForward = (inputs: number[], W: number[][][], b: number[][], actType: string) => {
    const activations: number[][] = [inputs]
    const zs: number[][] = []
    
    for (let l = 0; l < W.length; l++) {
      const prevA = activations[l]
      const layerW = W[l]
      const layerB = b[l]
      
      const nextZ: number[] = []
      const nextA: number[] = []
      const isOutputLayer = l === W.length - 1
      const currentActType = isOutputLayer ? 'sigmoid' : actType
      
      for (let o = 0; o < layerW.length; o++) {
        let sum = layerB[o]
        for (let i = 0; i < prevA.length; i++) {
          sum += prevA[i] * layerW[o][i]
        }
        nextZ.push(sum)
        nextA.push(activate(sum, currentActType))
      }
      zs.push(nextZ)
      activations.push(nextA)
    }
    
    return { activations, zs }
  }

  // Train Playground Loop Step
  const handlePlaygroundTrain = () => {
    if (isPlaygroundTraining) {
      if (playgroundInterval.current) clearInterval(playgroundInterval.current)
      setIsPlaygroundTraining(false)
      return
    }

    if (deepWeights.W.length === 0) return

    setIsPlaygroundTraining(true)
    let currentEpoch = epochPlayground
    let currentW = JSON.parse(JSON.stringify(deepWeights.W)) as number[][][]
    let currentB = JSON.parse(JSON.stringify(deepWeights.b)) as number[][]
    const newLossHistory = [...playLossHistory]

    playgroundInterval.current = setInterval(() => {
      let totalLoss = 0

      // Run multiple training steps per interval for visual speed
      for (let step = 0; step < 12; step++) {
        totalLoss = 0
        
        // Accumulate Gradients (Batch Gradient Descent)
        const gradW: number[][][] = currentW.map(layer => layer.map(n => n.map(() => 0)))
        const gradB: number[][] = currentB.map(layer => layer.map(() => 0))

        datasetPoints.forEach(row => {
          const inputVals = computeFeatures(row.x1, row.x2)
          const target = row.y
          
          // 1. Forward
          const { activations, zs } = runDeepForward(inputVals, currentW, currentB, activationType)
          const outputVal = activations[activations.length - 1][0]
          const error = outputVal - target
          totalLoss += 0.5 * Math.pow(error, 2)
          
          // 2. Backward deltas
          const deltas: number[][] = Array(currentW.length).fill(null)
          const L = currentW.length
          deltas[L - 1] = [error * activateDerivative(outputVal, 'sigmoid')]

          for (let l = L - 2; l >= 0; l--) {
            const nextDelta = deltas[l + 1]
            const layerW = currentW[l + 1]
            const act = activations[l + 1]
            const layerDelta: number[] = []
            
            for (let i = 0; i < currentW[l].length; i++) {
              let sum = 0
              for (let o = 0; o < layerW.length; o++) {
                sum += nextDelta[o] * layerW[o][i]
              }
              layerDelta.push(sum * activateDerivative(act[i], activationType))
            }
            deltas[l] = layerDelta
          }

          // 3. Accumulate gradients
          for (let l = 0; l < L; l++) {
            const act = activations[l]
            const d = deltas[l]
            for (let o = 0; o < currentW[l].length; o++) {
              for (let i = 0; i < act.length; i++) {
                gradW[l][o][i] += d[o] * act[i]
              }
              gradB[l][o] += d[o]
            }
          }
        })

        // 4. Update weight parameters
        for (let l = 0; l < currentW.length; l++) {
          for (let o = 0; o < currentW[l].length; o++) {
            for (let i = 0; i < currentW[l][o].length; i++) {
              const regTerm = regularization === 'L2' ? 0.001 * currentW[l][o][i] : 0
              currentW[l][o][i] -= learningRate * (gradW[l][o][i] / datasetPoints.length + regTerm)
            }
            currentB[l][o] -= learningRate * (gradB[l][o] / datasetPoints.length)
          }
        }
      }

      currentEpoch += 1
      const avgLoss = totalLoss / datasetPoints.length
      newLossHistory.push({ epoch: currentEpoch, loss: parseFloat(avgLoss.toFixed(5)) })

      if (newLossHistory.length > 80) newLossHistory.shift()

      setEpochPlayground(currentEpoch)
      setDeepWeights({ W: currentW, b: currentB })
      setPlayLossHistory([...newLossHistory])

      if (avgLoss < 0.002 || currentEpoch >= 1500) {
        if (playgroundInterval.current) clearInterval(playgroundInterval.current)
        setIsPlaygroundTraining(false)
      }
    }, 60)
  }

  // Run training step (1 epoch) manually
  const triggerOneEpochStep = () => {
    if (isPlaygroundTraining || deepWeights.W.length === 0) return
    
    let currentW = JSON.parse(JSON.stringify(deepWeights.W)) as number[][][]
    let currentB = JSON.parse(JSON.stringify(deepWeights.b)) as number[][]
    let totalLoss = 0
    
    const gradW: number[][][] = currentW.map(layer => layer.map(n => n.map(() => 0)))
    const gradB: number[][] = currentB.map(layer => layer.map(() => 0))

    datasetPoints.forEach(row => {
      const inputVals = computeFeatures(row.x1, row.x2)
      const target = row.y
      const { activations } = runDeepForward(inputVals, currentW, currentB, activationType)
      const outputVal = activations[activations.length - 1][0]
      const error = outputVal - target
      totalLoss += 0.5 * Math.pow(error, 2)
      
      const deltas: number[][] = Array(currentW.length).fill(null)
      const L = currentW.length
      deltas[L - 1] = [error * activateDerivative(outputVal, 'sigmoid')]

      for (let l = L - 2; l >= 0; l--) {
        const nextDelta = deltas[l + 1]
        const layerW = currentW[l + 1]
        const act = activations[l + 1]
        const layerDelta: number[] = []
        for (let i = 0; i < currentW[l].length; i++) {
          let sum = 0
          for (let o = 0; o < layerW.length; o++) {
            sum += nextDelta[o] * layerW[o][i]
          }
          layerDelta.push(sum * activateDerivative(act[i], activationType))
        }
        deltas[l] = layerDelta
      }

      for (let l = 0; l < L; l++) {
        const act = activations[l]
        const d = deltas[l]
        for (let o = 0; o < currentW[l].length; o++) {
          for (let i = 0; i < act.length; i++) {
            gradW[l][o][i] += d[o] * act[i]
          }
          gradB[l][o] += d[o]
        }
      }
    })

    for (let l = 0; l < currentW.length; l++) {
      for (let o = 0; o < currentW[l].length; o++) {
        for (let i = 0; i < currentW[l][o].length; i++) {
          const regTerm = regularization === 'L2' ? 0.001 * currentW[l][o][i] : 0
          currentW[l][o][i] -= learningRate * (gradW[l][o][i] / datasetPoints.length + regTerm)
        }
        currentB[l][o] -= learningRate * (gradB[l][o] / datasetPoints.length)
      }
    }

    const nextEpoch = epochPlayground + 1
    const avgLoss = totalLoss / datasetPoints.length
    const nextHistory = [...playLossHistory, { epoch: nextEpoch, loss: parseFloat(avgLoss.toFixed(5)) }]
    if (nextHistory.length > 80) nextHistory.shift()

    setEpochPlayground(nextEpoch)
    setDeepWeights({ W: currentW, b: currentB })
    setPlayLossHistory(nextHistory)
  }

  // Adjust layer neuron counts dynamically
  const changeHiddenNeuronCount = (layerIndex: number, increase: boolean) => {
    setHiddenLayers(prev => {
      const copy = [...prev]
      if (increase) {
        if (copy[layerIndex] < 6) copy[layerIndex] += 1
      } else {
        if (copy[layerIndex] > 1) copy[layerIndex] -= 1
      }
      return copy
    })
  }

  // Add hidden layer dynamically
  const addHiddenLayer = () => {
    if (hiddenLayers.length < 4) {
      setHiddenLayers([...hiddenLayers, 2])
    }
  }

  // Remove hidden layer dynamically
  const removeHiddenLayer = () => {
    if (hiddenLayers.length > 0) {
      setHiddenLayers(hiddenLayers.slice(0, hiddenLayers.length - 1))
    }
  }

  const renderDeepDecisionBoundaryGrid = () => {
    if (deepWeights.W.length === 0) return null
    
    const size = 18
    const cells = []
    
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        // Map coord to [-1.2, 1.2] range
        const x1 = ((c / (size - 1)) * 2.4) - 1.2
        const x2 = (((size - 1 - r) / (size - 1)) * 2.4) - 1.2
        
        const inputVals = computeFeatures(x1, x2)
        const { activations } = runDeepForward(inputVals, deepWeights.W, deepWeights.b, activationType)
        const val = activations[activations.length - 1][0]
        
        // Orange for 0, Blue for 1
        const rColor = Math.round(245 - (245 - 99) * val)
        const gColor = Math.round(158 - (158 - 102) * val)
        const bColor = Math.round(11 - (11 - 241) * val)
        
        const style = {
          backgroundColor: `rgb(${rColor}, ${gColor}, ${bColor})`,
          opacity: 0.85
        }
        
        cells.push(
          <div key={`${r}-${c}`} className="w-full h-full relative" style={style} />
        )
      }
    }
    return cells
  }

  // Clean cleanup on tab switch
  useEffect(() => {
    return () => {
      if (playgroundInterval.current) clearInterval(playgroundInterval.current)
    }
  }, [])

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      
      {/* Visual synapse animations styles */}
      <style>{`
        @keyframes signal-flow-fast {
          from { stroke-dashoffset: 30; }
          to { stroke-dashoffset: 0; }
        }
        @keyframes signal-flow-normal {
          from { stroke-dashoffset: 20; }
          to { stroke-dashoffset: 0; }
        }
        .signal-synapse {
          stroke-dasharray: 6 5;
          animation: signal-flow-normal 1.2s linear infinite;
        }
        .signal-synapse-active {
          stroke-dasharray: 5 3;
          animation: signal-flow-fast 0.6s linear infinite;
        }
        @keyframes pulse-wave {
          0% { opacity: 0.3; stroke-width: 1.5; }
          50% { opacity: 1; stroke-width: 3.5; }
          100% { opacity: 0.3; stroke-width: 1.5; }
        }
        .pulse-line {
          animation: pulse-wave 1.5s infinite;
        }
      `}</style>

      {/* Header */}
      <div className="h-14 border-b border-border-subtle bg-bg-panel flex items-center justify-between px-6 shrink-0 z-10">
        <div className="flex items-center gap-2.5">
          <Brain className="w-5 h-5 text-indigo-400 shrink-0" />
          <h1 className="text-sm font-bold text-foreground">Interactive NLP & ML Visualizer</h1>
        </div>
        
        {/* Three Tab Switch */}
        <div className="flex items-center bg-bg-input/60 rounded-xl p-1 border border-border-strong">
          <button
            onClick={() => setActiveTab('nlp')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'nlp'
                ? 'bg-bg-panel text-indigo-400 shadow-sm font-bold'
                : 'text-text-muted hover:text-foreground'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>NLP Pipeline</span>
          </button>
          
          <button
            onClick={() => setActiveTab('rag')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'rag'
                ? 'bg-bg-panel text-indigo-400 shadow-sm font-bold'
                : 'text-text-muted hover:text-foreground'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>RAG Context Search</span>
          </button>

          <button
            onClick={() => setActiveTab('playground')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'playground'
                ? 'bg-bg-panel text-indigo-400 shadow-sm font-bold'
                : 'text-text-muted hover:text-foreground'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>AI Engineer Lab</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 min-h-0">
        
        {/* ==================================================== */}
        {/* TAB 1: NLP PIPELINE VISUALIZER */}
        {/* ==================================================== */}
        {activeTab === 'nlp' && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 animate-fade-in pb-10">
            <div className="xl:col-span-2 space-y-6">
              <div className="bg-bg-panel border border-border-subtle rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-400" />
                    Input Teks Analisis
                  </h2>
                  <div className="flex gap-2">
                    {SAMPLE_SENTENCES.map((s, idx) => (
                      <button
                        key={idx}
                        onClick={() => setNlpInput(s)}
                        className="text-[10px] bg-bg-input hover:bg-bg-hover text-text-subtle font-medium px-2.5 py-1 rounded-lg border border-border-strong transition-colors cursor-pointer"
                      >
                        Contoh {idx + 1}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  value={nlpInput}
                  onChange={(e) => setNlpInput(e.target.value)}
                  placeholder="Ketik kalimat apapun di sini..."
                  rows={2}
                  maxLength={150}
                  className="w-full px-4 py-3 rounded-xl border border-border-strong bg-bg-input text-sm text-foreground placeholder:text-text-muted focus:outline-none focus:border-indigo-500 transition-all"
                />
              </div>

              <div className="bg-bg-panel border border-border-subtle rounded-2xl p-5 shadow-sm space-y-6">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-text-muted border-b border-border-subtle pb-2">
                  Alur Pemrosesan Teks (NLP Pipeline)
                </h3>

                {/* 1. TOKENIZATION */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-[10px] font-extrabold">1</span>
                      Tokenisasi (Tokenization)
                    </h4>
                    <span className="text-[10px] text-text-muted">Memecah teks menjadi potongan kata individual</span>
                  </div>
                  <div className="flex flex-wrap gap-2 p-3 bg-bg-input/40 border border-border-strong rounded-xl">
                    {tokens.map((token, idx) => (
                      <div
                        key={idx}
                        className="px-2.5 py-1 rounded-lg border border-indigo-500/20 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 font-mono text-xs cursor-default transition-all shadow-sm"
                      >
                        {token.raw}
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. TEXT CLEANING & NORMALIZATION */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-[10px] font-extrabold">2</span>
                      Normalisasi & Penghapusan Stopwords
                    </h4>
                    <button
                      onClick={() => setRemoveStopwords(!removeStopwords)}
                      className={`text-[10px] px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                        removeStopwords 
                          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 font-semibold' 
                          : 'bg-bg-input border-border-strong text-text-muted hover:text-foreground'
                      }`}
                    >
                      {removeStopwords ? 'Filter Aktif' : 'Klik untuk Filter Stopwords'}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2 p-3 bg-bg-input/40 border border-border-strong rounded-xl">
                    {tokens.map((token, idx) => {
                      const showFiltered = removeStopwords && token.isStopword
                      return (
                        <div
                          key={idx}
                          className={`px-2.5 py-1 rounded-lg border text-xs font-mono transition-all duration-300 ${
                            showFiltered
                              ? 'opacity-20 bg-bg-input border-dashed border-border-strong text-text-muted scale-95'
                              : token.isStopword
                              ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                              : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                          }`}
                          title={token.isStopword ? "Stopword (kata umum, sering dibuang)" : "Kunci Makna"}
                        >
                          {token.clean}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* 3. LEMMATIZATION vs STEMMING */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-[10px] font-extrabold">3</span>
                    Lematisasi (Lemmatization) vs Stemming
                  </h4>
                  <p className="text-[10px] text-text-muted mb-2">Stemming memangkas akhir kata secara kasar; Lematisasi mengembalikan kata ke kamus dasar berdasarkan maknanya.</p>
                  <div className="border border-border-strong rounded-xl overflow-hidden bg-bg-input/20">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-border-strong bg-bg-input/50">
                          <th className="p-3 font-semibold text-text-subtle">Kata Input</th>
                          <th className="p-3 font-semibold text-indigo-400">Stemming (Kasar)</th>
                          <th className="p-3 font-semibold text-emerald-400">Lemmatization (Kamus)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tokens.map((token, idx) => {
                          const mapping = LEMMA_MAP[token.clean]
                          if (!mapping) return null
                          return (
                            <tr key={idx} className="border-b border-border-strong/50 hover:bg-bg-hover/30">
                              <td className="p-3 font-medium text-foreground">{token.raw}</td>
                              <td className="p-3 font-mono text-indigo-400/90">{mapping.stem}</td>
                              <td className="p-3 font-mono text-emerald-400/90">{mapping.lemma}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 4. POS TAGGING */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-[10px] font-extrabold">4</span>
                      Part-of-Speech (POS) Tagging
                    </h4>
                    <span className="text-[10px] text-text-muted">Mengidentifikasi peran tata bahasa kata (Noun, Verb, dll.)</span>
                  </div>
                  <div className="flex flex-wrap gap-2.5 p-3 bg-bg-input/40 border border-border-strong rounded-xl">
                    {tokens.map((token, idx) => {
                      const mapping = LEMMA_MAP[token.clean]
                      const pos = mapping?.pos || "NN"
                      const desc = mapping?.posDesc || "Noun/Word"
                      return (
                        <div
                          key={idx}
                          className="flex flex-col border border-border-strong rounded-lg bg-bg-panel p-2 min-w-[70px] text-center hover:shadow-md transition-all shadow-sm"
                          title={desc}
                        >
                          <span className="text-xs font-bold text-foreground truncate mb-0.5">{token.raw}</span>
                          <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 uppercase self-center">
                            {pos}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-bg-panel border border-border-subtle rounded-2xl p-5 shadow-sm">
                <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-indigo-400" />
                  Kalkulator Cosine Similarity
                </h3>
                {availableWords.length < 2 ? (
                  <p className="text-xs text-text-muted">Harap masukkan kalimat yang memiliki lebih banyak kata untuk kalkulator ini.</p>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-semibold text-text-muted mb-1 block">Kata Pertama (A)</label>
                        <select
                          value={selectedWordA}
                          onChange={(e) => setSelectedWordA(e.target.value)}
                          className="w-full px-2.5 py-2 text-xs rounded-xl border border-border-strong bg-bg-input text-foreground focus:outline-none focus:border-indigo-500 cursor-pointer"
                        >
                          {availableWords.map(w => (
                            <option key={w} value={w}>{w}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-text-muted mb-1 block">Kata Kedua (B)</label>
                        <select
                          value={selectedWordB}
                          onChange={(e) => setSelectedWordB(e.target.value)}
                          className="w-full px-2.5 py-2 text-xs rounded-xl border border-border-strong bg-bg-input text-foreground focus:outline-none focus:border-indigo-500 cursor-pointer"
                        >
                          {availableWords.map(w => (
                            <option key={w} value={w}>{w}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="p-4 bg-bg-input/30 border border-border-strong rounded-xl flex flex-col items-center">
                      <div className="text-xs font-bold text-text-subtle mb-1">Skor Kemiripan</div>
                      <div className="text-2xl font-black text-indigo-400 mb-2">{(similarityScore * 100).toFixed(1)}%</div>
                      <div className="w-full bg-border-strong h-2.5 rounded-full overflow-hidden relative">
                        <div 
                          className="bg-indigo-500 h-full rounded-full transition-all duration-300"
                          style={{ width: `${Math.max(0, similarityScore) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-bg-panel border border-border-subtle rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Database className="w-4 h-4 text-indigo-400" />
                    2D Embedding Space Map
                  </h3>
                </div>
                <div className="h-60 w-full bg-bg-input/20 rounded-xl border border-border-strong relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2b2b2e30" />
                      <XAxis type="number" dataKey="x" name="X" domain={[-1.2, 1.2]} tick={{ fill: '#6B6A65', fontSize: 10 }} />
                      <YAxis type="number" dataKey="y" name="Y" domain={[-1.2, 1.2]} tick={{ fill: '#6B6A65', fontSize: 10 }} />
                      <RechartsTooltip 
                        cursor={{ strokeDasharray: '3 3' }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload
                            return (
                              <div className="bg-[#16161F] border border-[#2A2A3A] p-2 rounded-lg text-[10px]">
                                <p className="font-bold text-foreground uppercase">{data.name}</p>
                                <p className="text-text-muted">Kategori: {data.category}</p>
                              </div>
                            )
                          }
                          return null
                        }}
                      />
                      <Scatter name="Words" data={scatterData}>
                        {scatterData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[entry.category] || "#9CA3AF"} r={6} />
                        ))}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 2: RAG CONTEXT SEARCH VISUALIZER */}
        {/* ==================================================== */}
        {activeTab === 'rag' && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 animate-fade-in pb-10">
            <div className="xl:col-span-1 space-y-6">
              <div className="bg-bg-panel border border-border-subtle rounded-2xl p-5 shadow-sm">
                <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                  <Search className="w-4 h-4 text-indigo-400" />
                  Konteks Pertanyaan RAG
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-semibold text-text-muted mb-1.5 block">Pertanyaan Preset</label>
                    <div className="flex flex-col gap-2">
                      {RAG_PRESETS.map((preset, idx) => (
                        <button
                          key={idx}
                          onClick={() => setRagInput(preset.text)}
                          className={`text-left px-3 py-2 text-xs rounded-xl border transition-all cursor-pointer ${
                            ragInput === preset.text
                              ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-400 font-bold'
                              : 'bg-bg-input border-border-strong text-text-muted hover:text-foreground hover:bg-bg-hover'
                          }`}
                        >
                          {preset.label}
                          <div className="text-[9px] font-normal opacity-85 truncate mt-0.5">{preset.text}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold text-text-muted mb-1.5 block">Ketik Kustom Pertanyaan</label>
                    <textarea
                      value={ragInput}
                      onChange={(e) => setRagInput(e.target.value)}
                      placeholder="Masukkan pertanyaan RAG Anda..."
                      rows={3}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-border-strong bg-bg-input text-foreground focus:outline-none focus:border-indigo-500 transition-all font-sans"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-bg-panel border border-border-subtle rounded-2xl p-5 shadow-sm">
                <h4 className="text-xs font-bold text-foreground mb-3 flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-emerald-400" />
                  Query Vector Embedding (8-D)
                </h4>
                <div className="grid grid-cols-8 gap-1.5 p-2 bg-bg-input/60 rounded-xl border border-border-strong text-center font-mono text-[10px] font-bold text-foreground">
                  {queryVector.map((val, idx) => (
                    <div key={idx} className="flex flex-col bg-bg-panel p-1 rounded border border-border-strong">
                      <span className="text-[8px] text-text-muted mb-0.5 font-sans">d{idx+1}</span>
                      <span className={val >= 0 ? "text-emerald-400" : "text-rose-400"}>{val.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="xl:col-span-2 space-y-6">
              <div className="bg-bg-panel border border-border-subtle rounded-2xl p-5 shadow-sm flex flex-col h-full">
                <h3 className="text-sm font-bold text-foreground mb-1 flex items-center gap-2">
                  <Brain className="w-4 h-4 text-indigo-400" />
                  Visualisasi Alur Pencarian Konteks JST & RAG
                </h3>
                <p className="text-[10px] text-text-muted mb-4">Sinyal mengalir melalui Jaringan Syaraf Tiruan Encoder untuk menguji kemiripan semantik dan memilih dokumen terbaik.</p>

                <div className="flex-1 flex items-center justify-center bg-bg-input/20 border border-border-strong rounded-xl min-h-[460px] p-4 relative overflow-x-auto">
                  <svg width="650" height="420" viewBox="0 0 650 420" className="overflow-visible select-none">
                    {Array.from({ length: 4 }).map((_, i) => {
                      const inputY = 60 + i * 55
                      return Array.from({ length: 5 }).map((__, j) => {
                        const hiddenY = 40 + j * 50
                        return (
                          <line
                            key={`enc-l1-${i}-${j}`}
                            x1="90" y1={inputY} x2="190" y2={hiddenY}
                            stroke="#818CF8"
                            strokeWidth="1"
                            opacity={activeEncoderAnimation ? "0.6" : "0.25"}
                            className={activeEncoderAnimation ? "signal-synapse-active" : "signal-synapse"}
                          />
                        )
                      })
                    })}

                    {Array.from({ length: 5 }).map((_, i) => {
                      const hiddenY = 40 + i * 50
                      return Array.from({ length: 8 }).map((__, j) => {
                        const vectorY = 25 + j * 38
                        return (
                          <line
                            key={`enc-l2-${i}-${j}`}
                            x1="190" y1={hiddenY} x2="290" y2={vectorY}
                            stroke="#34D399"
                            strokeWidth="1"
                            opacity={activeEncoderAnimation ? "0.6" : "0.25"}
                            className={activeEncoderAnimation ? "signal-synapse-active" : "signal-synapse"}
                          />
                        )
                      })
                    })}

                    {ragSimilarities.map((chunk, idx) => {
                      const chunkY = 60 + idx * 135
                      const isWinner = chunk.id === winningChunk.id
                      return (
                        <g key={chunk.id}>
                          <line
                            x1="320" y1="160" x2="440" y2={chunkY + 15}
                            stroke={isWinner ? "#34D399" : "#9CA3AF"}
                            strokeWidth={isWinner ? "3" : "1.2"}
                            className={isWinner ? "pulse-line signal-synapse-active" : "signal-synapse"}
                            opacity={isWinner ? "1" : "0.35"}
                          />
                          <rect x="355" y={100 + idx * 75} width="50" height="18" rx="6" fill="#16161F" stroke={isWinner ? "#34D399" : "#2b2b2e"} strokeWidth="1" />
                          <text x="380" y={112} className={`text-[8px] font-black font-mono ${isWinner ? 'fill-emerald-400' : 'fill-text-muted'}`} textAnchor="middle">
                            {(chunk.similarity * 100).toFixed(0)}% Match
                          </text>
                        </g>
                      )
                    })}

                    {/* Inputs */}
                    <text x="50" y="30" className="text-[10px] font-extrabold fill-text-muted uppercase" textAnchor="middle">Tokens Input</text>
                    {ragInput.split(/\s+/).slice(0, 4).map((word, idx) => {
                      const inputY = 60 + idx * 55
                      const cleanWord = word.replace(/[^a-zA-Z]/g, '')
                      return (
                        <g key={idx}>
                          <rect x="10" y={inputY - 14} width="80" height="24" rx="8" fill="#818cf8" fillOpacity="0.1" stroke="#818cf8" strokeOpacity="0.3" />
                          <text x="50" y={inputY + 2} className="text-[9px] font-bold fill-indigo-400 text-center" textAnchor="middle">
                            {cleanWord.length > 9 ? cleanWord.slice(0, 8) + '..' : cleanWord || '?'}
                          </text>
                        </g>
                      )
                    })}
                    
                    {/* Hidden */}
                    <text x="190" y="30" className="text-[10px] font-extrabold fill-text-muted uppercase" textAnchor="middle">Hidden Layer</text>
                    {Array.from({ length: 5 }).map((_, idx) => {
                      const hiddenY = 40 + idx * 50
                      return (
                        <circle key={idx} cx="190" cy={hiddenY} r="10" fill="#151517" stroke="#34d399" strokeWidth="1.5" style={{ filter: activeEncoderAnimation ? 'drop-shadow(0px 0px 4px rgba(52, 211, 153, 0.5))' : '' }} />
                      )
                    })}

                    {/* Query Vector */}
                    <text x="295" y="15" className="text-[10px] font-extrabold fill-text-muted uppercase" textAnchor="middle">Query Vector</text>
                    <g>
                      <rect x="280" y="25" width="30" height="300" rx="6" fill="#151517" stroke="#818cf8" strokeWidth="1.5" />
                      {queryVector.map((val, idx) => {
                        const segmentY = 25 + idx * 37.5
                        const colorInt = Math.abs(val) * 0.7 + 0.15
                        return (
                          <rect key={idx} x="282.5" y={segmentY + 2} width="25" height="32.5" rx="4" fill={val >= 0 ? `rgba(52, 211, 153, ${colorInt})` : `rgba(236, 72, 153, ${colorInt})`} />
                        )
                      })}
                    </g>

                    {/* Chunks */}
                    <text x="530" y="30" className="text-[10px] font-extrabold fill-text-muted uppercase" textAnchor="middle">Database Vektor (ChromaDB)</text>
                    {ragSimilarities.map((chunk, idx) => {
                      const chunkY = 60 + idx * 135
                      const isWinner = chunk.id === winningChunk.id
                      return (
                        <g key={chunk.id}>
                          <rect x="440" y={chunkY - 10} width="190" height="70" rx="12" fill="#151517" stroke={isWinner ? "#34D399" : "#2b2b2e"} strokeWidth={isWinner ? "2" : "1"} style={{ filter: isWinner ? 'drop-shadow(0px 0px 8px rgba(52, 211, 153, 0.25))' : '' }} />
                          <text x="455" y={chunkY + 10} className={`text-[9px] font-black ${isWinner ? 'fill-emerald-400' : 'fill-text-subtle'}`}>{chunk.title}</text>
                          <text x="455" y={chunkY + 28} className="text-[8px] fill-text-muted">{chunk.text.slice(0, 42) + '...'}</text>
                          <text x="455" y={chunkY + 40} className="text-[8px] fill-text-muted">{chunk.text.slice(42)}</text>
                          {isWinner && (
                            <g transform={`translate(605, ${chunkY - 3})`}>
                              <circle cx="8" cy="8" r="7" fill="#34D399" />
                              <path d="M 5 8 L 7 10 L 11 6" stroke="#0b0b0d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                            </g>
                          )}
                        </g>
                      )
                    })}
                  </svg>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 3: DEEP JST PLAYGROUND (TENSORFLOW STYLE) */}
        {/* ==================================================== */}
        {activeTab === 'playground' && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 animate-fade-in pb-10">
            
            {/* Control Bar (Full Top spanning 12 cols) */}
            <div className="xl:col-span-12 bg-bg-panel border border-border-subtle rounded-2xl p-4 flex flex-wrap gap-4 items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <button
                  onClick={handlePlaygroundReset}
                  className="p-2 border border-border-strong hover:bg-bg-hover text-text-subtle hover:text-foreground rounded-xl transition-all cursor-pointer"
                  title="Reset Laboratory"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                
                <button
                  onClick={handlePlaygroundTrain}
                  className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl shadow-lg transition-all active:scale-95 cursor-pointer ${
                    isPlaygroundTraining 
                      ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-500/10' 
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/10'
                  }`}
                >
                  {isPlaygroundTraining ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  {isPlaygroundTraining ? 'Jeda Latihan' : 'Mulai Latihan'}
                </button>

                <button
                  onClick={triggerOneEpochStep}
                  disabled={isPlaygroundTraining}
                  className="flex items-center gap-1.5 px-3.5 py-2 border border-border-strong hover:bg-bg-hover disabled:opacity-30 rounded-xl text-xs font-semibold text-text-subtle hover:text-foreground transition-all cursor-pointer"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  Satu Epoch (Step)
                </button>
              </div>

              <div className="flex flex-wrap gap-4 items-center">
                {/* Epoch Counter */}
                <div className="text-xs text-text-subtle flex items-center gap-1">
                  <span className="font-bold text-text-muted font-mono">Epoch:</span>
                  <span className="font-black text-foreground bg-bg-input px-2.5 py-1 rounded-lg border border-border-strong font-mono">{epochPlayground}</span>
                </div>

                {/* Learning rate selector */}
                <div className="flex items-center gap-1.5">
                  <label className="text-[10px] font-bold text-text-muted">Learning Rate:</label>
                  <select
                    value={learningRate}
                    onChange={(e) => setLearningRate(parseFloat(e.target.value))}
                    className="px-2.5 py-1 text-xs rounded-xl border border-border-strong bg-bg-input text-foreground focus:outline-none cursor-pointer"
                  >
                    {[0.01, 0.03, 0.1, 0.3].map(lr => (
                      <option key={lr} value={lr}>{lr}</option>
                    ))}
                  </select>
                </div>

                {/* Activation function selector */}
                <div className="flex items-center gap-1.5">
                  <label className="text-[10px] font-bold text-text-muted">Aktivasi:</label>
                  <select
                    value={activationType}
                    onChange={(e) => setActivationType(e.target.value)}
                    className="px-2.5 py-1 text-xs rounded-xl border border-border-strong bg-bg-input text-foreground focus:outline-none cursor-pointer"
                  >
                    {['sigmoid', 'tanh', 'relu'].map(act => (
                      <option key={act} value={act}>{act.toUpperCase()}</option>
                    ))}
                  </select>
                </div>

                {/* Regularization type selector */}
                <div className="flex items-center gap-1.5">
                  <label className="text-[10px] font-bold text-text-muted">Regularisasi:</label>
                  <select
                    value={regularization}
                    onChange={(e) => setRegularization(e.target.value)}
                    className="px-2.5 py-1 text-xs rounded-xl border border-border-strong bg-bg-input text-foreground focus:outline-none cursor-pointer"
                  >
                    {['None', 'L2'].map(reg => (
                      <option key={reg} value={reg}>{reg}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Left Column: Dataset selection and Feature controls (3 cols) */}
            <div className="xl:col-span-3 space-y-6">
              
              {/* Dataset selection */}
              <div className="bg-bg-panel border border-border-subtle rounded-2xl p-5 shadow-sm space-y-4">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-text-muted border-b border-border-subtle pb-2">
                  1. Pilih Dataset
                </h3>
                
                <div className="grid grid-cols-2 gap-2.5">
                  {(['circle', 'xor', 'gaussian', 'spiral'] as DatasetType[]).map(type => (
                    <button
                      key={type}
                      onClick={() => setSelectedDataset(type)}
                      className={`flex flex-col items-center p-2 rounded-xl border text-center transition-all cursor-pointer hover:bg-bg-hover/40 ${
                        selectedDataset === type
                          ? 'border-indigo-500 bg-indigo-500/5 text-indigo-400 font-bold'
                          : 'border-border-strong text-text-muted'
                      }`}
                    >
                      {/* SVG Thumbnail based on dataset */}
                      <svg width="40" height="40" viewBox="-1.2 -1.2 2.4 2.4" className="mb-1">
                        {type === 'circle' && (
                          <>
                            <circle cx="0" cy="0" r="0.35" fill="#F59E0B" />
                            <circle cx="0" cy="0" r="0.9" fill="none" stroke="#818CF8" strokeWidth="0.2" />
                          </>
                        )}
                        {type === 'xor' && (
                          <>
                            <rect x="0.1" y="0.1" width="0.8" height="0.8" fill="#818CF8" />
                            <rect x="-0.9" y="-0.9" width="0.8" height="0.8" fill="#818CF8" />
                            <rect x="-0.9" y="0.1" width="0.8" height="0.8" fill="#F59E0B" />
                            <rect x="0.1" y="-0.9" width="0.8" height="0.8" fill="#F59E0B" />
                          </>
                        )}
                        {type === 'gaussian' && (
                          <>
                            <circle cx="-0.4" cy="-0.4" r="0.3" fill="#F59E0B" />
                            <circle cx="0.4" cy="0.4" r="0.3" fill="#818CF8" />
                          </>
                        )}
                        {type === 'spiral' && (
                          <>
                            <path d="M 0 0 A 0.2 0.2 0 0 1 0.2 0.1 A 0.4 0.4 0 0 1 -0.3 -0.2 A 0.6 0.6 0 0 1 0.4 0.4" fill="none" stroke="#F59E0B" strokeWidth="0.1" />
                            <path d="M 0 0 A 0.2 0.2 0 0 0 -0.2 -0.1 A 0.4 0.4 0 0 0 0.3 0.2 A 0.6 0.6 0 0 0 -0.4 -0.4" fill="none" stroke="#818CF8" strokeWidth="0.1" />
                          </>
                        )}
                      </svg>
                      <span className="text-[10px] capitalize font-semibold">{type}</span>
                    </button>
                  ))}
                </div>

                {/* Noise Slider */}
                <div>
                  <div className="flex justify-between items-center text-[10px] text-text-subtle mb-1">
                    <span>Kebisingan Data (Noise)</span>
                    <span className="font-bold text-foreground">{datasetNoise}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="50"
                    step="5"
                    value={datasetNoise}
                    onChange={(e) => setDatasetNoise(parseInt(e.target.value))}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                </div>
              </div>

              {/* Toggle input features */}
              <div className="bg-bg-panel border border-border-subtle rounded-2xl p-5 shadow-sm space-y-4">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-text-muted border-b border-border-subtle pb-2">
                  2. Fitur Input ($X_i$)
                </h3>
                <div className="flex flex-col gap-2">
                  {Object.keys(activeFeatures).map(feat => {
                    const labelMap: Record<string, string> = {
                      x1: "X₁",
                      x2: "X₂",
                      x1_sq: "X₁²",
                      x2_sq: "X₂²",
                      x1_x2: "X₁X₂",
                      sin_x1: "sin(X₁)",
                      sin_x2: "sin(X₂)"
                    }
                    const active = activeFeatures[feat as keyof FeatureConfig]
                    return (
                      <button
                        key={feat}
                        onClick={() => {
                          const activeCount = Object.values(activeFeatures).filter(v => v).length
                          if (activeCount > 1 || !active) {
                            setActiveFeatures(prev => ({ ...prev, [feat]: !active }))
                          }
                        }}
                        className={`flex items-center justify-between px-3 py-2 text-xs rounded-xl border transition-all cursor-pointer ${
                          active
                            ? 'border-indigo-500/40 bg-indigo-500/5 text-indigo-400 font-bold'
                            : 'border-border-strong text-text-muted hover:bg-bg-hover/20'
                        }`}
                      >
                        <span className="font-mono">{labelMap[feat]}</span>
                        <input
                          type="checkbox"
                          checked={active}
                          readOnly
                          className="w-3.5 h-3.5 rounded border-border-strong text-indigo-600 focus:ring-indigo-500 cursor-pointer pointer-events-none"
                        />
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Middle Column: Architecture controls and SVG visualizer (6 cols) */}
            <div className="xl:col-span-6 space-y-6">
              <div className="bg-bg-panel border border-border-subtle rounded-2xl p-5 shadow-sm flex flex-col h-full">
                
                {/* Layer size customization controls */}
                <div className="flex flex-wrap items-center justify-between border-b border-border-subtle pb-3 mb-4">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-text-muted">
                    3. Arsitektur Jaringan Dalam (Deep ANN Graph)
                  </h3>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={removeHiddenLayer}
                      disabled={hiddenLayers.length <= 0}
                      className="px-2.5 py-1 text-[10px] font-bold border border-border-strong hover:bg-bg-hover disabled:opacity-30 rounded-lg cursor-pointer transition-colors"
                    >
                      Hapus Layer
                    </button>
                    <span className="text-[10px] font-bold text-text-subtle">
                      {hiddenLayers.length} Hidden Layer{hiddenLayers.length !== 1 ? 's' : ''}
                    </span>
                    <button
                      onClick={addHiddenLayer}
                      disabled={hiddenLayers.length >= 4}
                      className="px-2.5 py-1 text-[10px] font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg cursor-pointer transition-colors shadow-sm"
                    >
                      Tambah Layer
                    </button>
                  </div>
                </div>

                {/* SVG deep network area */}
                <div className="flex-1 flex flex-col items-center justify-center p-4 bg-bg-input/20 border border-border-strong rounded-xl min-h-[380px] relative overflow-x-auto">
                  
                  {/* Layer neuron count adjustments overlay buttons */}
                  <div className="w-full flex justify-around mb-2 px-10 text-center select-none text-[9px] font-bold text-text-muted">
                    <div className="w-16">Inputs ({layerSizes[0]})</div>
                    {hiddenLayers.map((size, idx) => (
                      <div key={idx} className="w-16 flex flex-col items-center bg-bg-panel border border-border-strong p-1 rounded-lg">
                        <span className="text-[8px] text-indigo-400 mb-0.5">Layer {idx+1}</span>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => changeHiddenNeuronCount(idx, false)}
                            disabled={size <= 1}
                            className="p-0.5 text-text-muted hover:text-foreground disabled:opacity-30 cursor-pointer"
                          >
                            <Minus className="w-2.5 h-2.5" />
                          </button>
                          <span className="font-mono text-foreground font-black">{size}</span>
                          <button
                            onClick={() => changeHiddenNeuronCount(idx, true)}
                            disabled={size >= 6}
                            className="p-0.5 text-text-muted hover:text-foreground disabled:opacity-30 cursor-pointer"
                          >
                            <Plus className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                    <div className="w-16">Output (1)</div>
                  </div>

                  {/* Draw Deep Neural Network Graph */}
                  {deepWeights.W.length > 0 && (
                    <svg width="450" height="280" viewBox="0 0 450 280" className="overflow-visible select-none">
                      
                      {/* DRAW CONNECTION LINES (EDGES) */}
                      {layerSizes.map((currentSize, layerIdx) => {
                        if (layerIdx === layerSizes.length - 1) return null
                        const nextSize = layerSizes[layerIdx + 1]
                        
                        const spacingCurrent = 240 / (currentSize + 1)
                        const spacingNext = 240 / (nextSize + 1)
                        
                        const xCurrent = 30 + layerIdx * (390 / (layerSizes.length - 1))
                        const xNext = 30 + (layerIdx + 1) * (390 / (layerSizes.length - 1))

                        return Array.from({ length: currentSize }).map((_, i) => {
                          const yCurrent = spacingCurrent * (i + 1) + 20
                          
                          return Array.from({ length: nextSize }).map((__, j) => {
                            const yNext = spacingNext * (j + 1) + 20
                            
                            // Retrieve weight value safely
                            const weightVal = deepWeights.W[layerIdx]?.[j]?.[i] ?? 0
                            
                            return (
                              <line
                                key={`deep-line-${layerIdx}-${i}-${j}`}
                                x1={xCurrent} y1={yCurrent} x2={xNext} y2={yNext}
                                stroke={weightVal >= 0 ? "#34D399" : "#EC4899"}
                                strokeWidth={Math.max(0.6, Math.min(6, Math.abs(weightVal) * 2.8))}
                                opacity="0.6"
                                className={isPlaygroundTraining ? "signal-synapse-active" : "signal-synapse"}
                              />
                            )
                          })
                        })
                      })}

                      {/* DRAW NEURON CIRCLES */}
                      {layerSizes.map((size, layerIdx) => {
                        const spacing = 240 / (size + 1)
                        const x = 30 + layerIdx * (390 / (layerSizes.length - 1))
                        const isInput = layerIdx === 0
                        const isOutput = layerIdx === layerSizes.length - 1
                        const isHidden = !isInput && !isOutput

                        return Array.from({ length: size }).map((_, idx) => {
                          const y = spacing * (idx + 1) + 20
                          
                          // Default colors
                          let strokeColor = "#818CF8" // inputs
                          let fillColor = "#1b1b1d"
                          
                          if (isHidden) strokeColor = "#34D399" // hidden
                          if (isOutput) strokeColor = "#F59E0B" // output

                          // Hover details trigger
                          const triggerHoverInfo = () => {
                            if (isInput) {
                              setHoveredDeepNeuron({
                                label: `Input Feature #${idx + 1}`,
                                text: `Menyalurkan sinyal parameter fitur.`
                              })
                            } else if (isHidden) {
                              const bias = deepWeights.b[layerIdx - 1]?.[idx] ?? 0
                              setHoveredDeepNeuron({
                                label: `Neuron Hidden Layer ${layerIdx}, Node ${idx + 1}`,
                                text: `Fungsi Aktivasi: ${activationType.toUpperCase()}, Bias: ${bias.toFixed(3)}`
                              })
                            } else if (isOutput) {
                              const bias = deepWeights.b[layerIdx - 1]?.[idx] ?? 0
                              setHoveredDeepNeuron({
                                label: `Neuron Output (Y)`,
                                text: `Klasifikasi Biner (Sigmoid), Bias: ${bias.toFixed(3)}`
                              })
                            }
                          }

                          return (
                            <circle
                              key={`deep-node-${layerIdx}-${idx}`}
                              cx={x} cy={y} r="10"
                              fill={fillColor}
                              stroke={strokeColor}
                              strokeWidth="2"
                              className="cursor-pointer hover:scale-125 transition-transform"
                              onMouseEnter={triggerHoverInfo}
                            />
                          )
                        })
                      })}
                    </svg>
                  )}

                  {/* Hover explanation bar */}
                  <div className="w-full mt-3 p-3 bg-bg-panel rounded-xl border border-border-strong min-h-[48px] text-[10px] text-text-subtle text-center">
                    {hoveredDeepNeuron ? (
                      <div>
                        <span className="font-bold text-indigo-400 block">{hoveredDeepNeuron.label}</span>
                        {hoveredDeepNeuron.text}
                      </div>
                    ) : (
                      <span className="text-text-muted">Arahkan kursor ke node neuron untuk menginspeksi parameter layer JST.</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Training curve loss and decision boundary (3 cols) */}
            <div className="xl:col-span-3 space-y-6">
              
              {/* Decision Boundary output map */}
              <div className="bg-bg-panel border border-border-subtle rounded-2xl p-5 shadow-sm space-y-3">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-400" />
                  Boundary Pembagian Bidang JST
                </h3>
                
                {/* 2D coordinates overlaid with dataset points */}
                <div className="aspect-square w-full rounded-xl overflow-hidden border border-border-strong relative bg-bg-input">
                  {/* Underlay color decision grid */}
                  <div className="grid grid-cols-18 grid-rows-18 h-full w-full absolute inset-0">
                    {renderDeepDecisionBoundaryGrid()}
                  </div>

                  {/* Overlay actual dataset points */}
                  <svg className="w-full h-full absolute inset-0 overflow-visible pointer-events-none">
                    {datasetPoints.map((p, idx) => {
                      // Map coordinates [-1.2, 1.2] to [0, 100]% SVG scale
                      const pctX = ((p.x1 + 1.2) / 2.4) * 100
                      const pctY = ((1.2 - p.x2) / 2.4) * 100
                      
                      return (
                        <circle
                          key={idx}
                          cx={`${pctX}%`}
                          cy={`${pctY}%`}
                          r="4.5"
                          fill={p.y === 1 ? "#818CF8" : "#F59E0B"}
                          stroke="#ffffff"
                          strokeWidth="1.2"
                        />
                      )
                    })}
                  </svg>
                </div>

                <div className="flex items-center justify-between text-[10px] text-text-muted font-semibold">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B] border border-white" />
                    Kelas 0 (Oranye)
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#818CF8] border border-white" />
                    Kelas 1 (Biru)
                  </div>
                </div>
              </div>

              {/* Loss Curve linechart */}
              <div className="bg-bg-panel border border-border-subtle rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    Training Loss History
                  </h4>
                </div>

                <div className="h-32 bg-bg-input/20 border border-border-strong rounded-xl p-1">
                  {playLossHistory.length === 0 ? (
                    <div className="w-full h-full flex flex-col items-center justify-center text-[10px] text-text-muted text-center p-3">
                      <Zap className="w-6 h-6 text-indigo-400/50 mb-1" />
                      Loss metrics akan tampil di sini saat latihan aktif.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={playLossHistory}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#2b2b2e15" />
                        <XAxis dataKey="epoch" tick={{ fill: '#6B6A65', fontSize: 7 }} />
                        <YAxis tick={{ fill: '#6B6A65', fontSize: 7 }} />
                        <RechartsTooltip contentStyle={{ background: '#16161F', border: '1px solid #2A2A3A', fontSize: 8 }} />
                        <Line type="monotone" dataKey="loss" stroke="#34D399" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
