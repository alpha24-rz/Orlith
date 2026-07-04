# ORLITH AI Product Demonstration Flow

You are an automated presenter recording a high-quality product video demo of ORLITH AI (an Enterprise Corporate Brain & RAG Platform). 
Follow these steps slowly and gracefully. Ensure cursor movements are smooth and hover actions linger for 1-2 seconds on key elements to show interactive states (hover effects, tooltips).

## Phase 1: Authentication & Navigation
1. Open the landing page at the target URL.
2. If there is a "Get Started" or "Login" button, click on it with a smooth hover.
3. Fill in the email input with "admin@orlith.ai" and the password with "admin123" (or appropriate demo credentials).
4. Click the "Sign In" button and wait for the dashboard transition animation to complete.

## Phase 2: Create a Workspace (Isolated Tenant)
1. On the sidebar, locate and click the "+" button or "Create Workspace" button.
2. In the modal/form that appears, name the workspace "Engineering Docs & Research".
3. Add a short description: "Central repository for engineering specifications, architecture, and research papers."
4. Click the "Create Workspace" button.
5. Notice the success toast notification and wait for the workspace dashboard to load.

## Phase 3: Configure LLM & Embedding Settings (BYOK)
1. Navigate to the "Workspace Settings" or "Model Configuration" tab.
2. Select "Gemini 1.5 Flash" (or another active provider) from the dropdown list.
3. Hover over the API Key input, simulate typing the API key, and click "Save Configuration".
4. Highlight the "Embedding Profile" showing that the workspace uses local/offline embeddings.

## Phase 4: Document Ingestion & Semantic Chunking
1. Navigate to the "Documents" or "Upload Center" section.
2. Click on the "Upload Document" area. (If screencli supports file upload, select a sample PDF like 'architecture_spec.pdf'. Otherwise, simulate drag-and-dropping a document).
3. Once the file is selected, click "Process Document".
4. Wait for the pipeline status indicator to change from "Parsing" ➔ "Semantic Chunking" ➔ "Vector Indexing" ➔ "Ready".
5. Hover over the document card to show the metadata tag (e.g., "Vector Count: 128", "Reindex Status: Valid").

## Phase 5: RAG Chat with Citation & Source Attribution
1. Click on the "Chat" or "Workspace Brain" page from the sidebar.
2. Click the chat input bar at the bottom.
3. Slowly type the query: "Apa saja komponen utama dari arsitektur backend ORLITH AI?" and hit Enter.
4. Watch the streaming response start text generation (token-by-token) with smooth animations.
5. Once the output is complete, scroll down slightly to focus on the "Sources & Citations" section.
6. Hover over one of the citation cards (showing similarity score e.g., 0.91, page number, and original text snippet) to show details.
7. Click on the source citation to show the highlighting effect on the source document chunk.

## Phase 6: AI Model Intelligence & Benchmark Radar
1. Navigate to the "Model Intelligence" or "LLM Radar" dashboard from the sidebar menu.
2. Wait for the Radar Chart to animate and render.
3. Hover over the 6 axes of the radar chart to highlight metrics:
   - Accuracy (Answer Acceptance Rate)
   - Speed (Time-to-First-Token)
   - Cost (Token Consumption)
   - Citation Quality (Accurate source attributions)
   - Reliability (Success rate/timeouts)
   - Context Understanding (Faithfulness & relevancy)
4. Scroll down to the "Model Recommendations" panel.
5. Hover over the suggestion box saying: "Recommendation: Switch to Claude 3.5 Sonnet (+18% Accuracy, -5% Speed, +35% Cost)".

## Phase 7: Usage Analytics
1. Go to the "Usage Analytics" dashboard.
2. Hover over the cards displaying:
   - "Total Questions Asked"
   - "Documents Indexed"
   - "Storage Used"
   - "Estimated Cost"
3. Show the "Most Accessed Documents" list and hover over the top file.

## Phase 8: Wrap Up
1. Navigate back to the main chat window.
2. Wait 3 seconds, then stop the recording.
