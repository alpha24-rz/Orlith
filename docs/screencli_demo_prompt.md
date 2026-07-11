# ORLITH AI Product Demonstration Flow

You are an automated presenter recording a high-quality product video demo of ORLITH AI (an Enterprise Corporate Brain & RAG Platform). 
Follow these steps slowly and gracefully. Ensure cursor movements are smooth and hover actions linger for 1-2 seconds on key elements to show interactive states (hover effects, tooltips).

## Phase 1: Authentication & Navigation
1. Open the landing page at the target URL.
2. If there is a "Get Started" or "Login" button, click on it with a smooth hover.
3. Fill in the email input with "adminorlith@gmail.com" and the password with "adminorlith".
4. Click the "Sign In" button and wait for the dashboard transition animation to complete.

## Phase 2: Create a Workspace (Isolated Tenant UI Demo)
1. On the sidebar, locate and click the "+" button or "Create Workspace" button.
2. In the modal/form that appears, name the workspace "Engineering Docs & Research".
3. Add a short description: "Central repository for engineering specifications, architecture, and research papers."
4. Click the "Create Workspace" button.
5. Notice the success toast notification and wait for the workspace dashboard to load.

## Phase 3: Visit Documents Section (Uploader UI Demo)
1. Click the "Documents" menu in the sidebar to navigate to the Document Library.
2. Hover over the drag-and-drop upload zone to show the user interface for adding files.
3. Linger for a moment to let the viewer see the modern file uploader area.

## Phase 4: Switch Workspace to "K3" (Accessing Pre-uploaded Documents)
1. Click on the workspace selector dropdown/selector at the top of the sidebar.
2. Select the pre-existing workspace named **"K3"** (which contains the pre-uploaded BMKG testing documents).
3. Wait for the UI to update and switch scopes to the K3 workspace.
4. Click the "Documents" menu in the sidebar to show the library containing the active **BMKG RAG Testing Documents** (e.g. `dokumen_testing_rag_bmkg-v*.pdf`).
5. Hover over the document cards to showcase the indexing metadata (Vector Count, Indexing Status).

## Phase 5: Check Chat & Missing API Key
1. Click on the "Chat & Q&A" menu in the sidebar.
2. Move the cursor towards the model selector dropdown at the top-right of the chat window.
3. Click the model dropdown to expand it, showing that no LLM models are available or there is a warning indicating "No API Key Connected".
4. Close the dropdown or click outside of it.

## Phase 6: Configure OpenRouter API Key (BYOK Setup)
1. Click on the "Settings" or "Workspace Settings" menu in the sidebar.
2. Navigate to the API Configuration section.
3. Find the model provider options and select **"OpenRouter"** from the provider dropdown list.
4. Click on the API Key input field and enter the key: `YOUR_OPENROUTER_API_KEY`.
5. Click the "Save Configuration" or "Update Settings" button.
6. Notice the success notification confirming settings were saved.

## Phase 7: RAG Chat with Citation & Source Attribution
1. Navigate back to the "Chat & Q&A" page from the sidebar.
2. Click the model selector dropdown again—notice that the OpenRouter models are now loaded and available.
3. Select an active OpenRouter model (e.g., Gemini or Claude model via OpenRouter).
4. Click the chat input bar at the bottom.
5. Slowly type the query: "Bagaimana prosedur diseminasi informasi peringatan dini atau cuaca ekstrem berdasarkan dokumen BMKG?" and hit Enter.
6. Watch the streaming response start text generation (token-by-token) with smooth animations.
7. Once the output is complete, scroll down slightly to focus on the "Sources & Citations" section.
8. Hover over one of the citation cards (showing similarity score, page number, and original BMKG text snippet) to show detail.
9. Click on the source citation to show the highlighting effect on the source document chunk.
10. Click the chat input bar again to ask a follow-up question.
11. Slowly type the query: "Siapa penulis dari dokumen dengan kode BMKG-KLI-AGRO-2026-102 dan mengenai apa isi dokumen tersebut?" and hit Enter.
12. Watch the streaming RAG response generate the answer using the BMKG document context.
13. Scroll down to review the new citations list.

## Phase 8: AI Model Intelligence & Benchmark Radar
1. Navigate to the "Model Intelligence" or "LLM Radar" dashboard from the sidebar menu.
2. Wait for the Radar Chart to animate and render.
3. Hover over the 6 axes of the radar chart to highlight metrics:
   - Accuracy (Answer Acceptance Rate)
   - Speed (Time-to-First-Token)
   - Cost (Token Consumption)
   - Citation Quality (Accurate source citations)
   - Reliability (Success rate/timeouts)
   - Context Understanding (Faithfulness & relevancy)
4. Scroll down to the "Model Recommendations" panel.
5. Hover over the suggestion box recommending model changes based on real workspace history.

## Phase 9: Usage Analytics
1. Go to the "Usage Analytics" dashboard.
2. Hover over the cards displaying:
   - "Total Questions Asked"
   - "Documents Indexed"
   - "Storage Used"
   - "Estimated Cost"
3. Show the "Most Accessed Documents" list and hover over the top BMKG document.

## Phase 10: Wrap Up
1. Navigate back to the main chat window.
2. Wait 3 seconds, then stop the recording.
