# Graph Report - savant-quorum  (2026-07-12)

## Corpus Check
- 117 files · ~78,428 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 911 nodes · 1328 edges · 62 communities (61 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `751918c5`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]

## God Nodes (most connected - your core abstractions)
1. `cn()` - 224 edges
2. `compilerOptions` - 18 edges
3. `Forge Style Guide` - 18 edges
4. `16. Visual Examples` - 13 edges
5. `scripts` - 11 edges
6. `build` - 11 edges
7. `Chat and Agents` - 10 edges
8. `buttonVariants` - 9 edges
9. `getRunTiming()` - 7 edges
10. `createAthenaService()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `AccordionItem()` --calls--> `cn()`  [EXTRACTED]
  src/renderer/components/ui/accordion.tsx → src/renderer/components/ui/utils.ts
- `AccordionTrigger()` --calls--> `cn()`  [EXTRACTED]
  src/renderer/components/ui/accordion.tsx → src/renderer/components/ui/utils.ts
- `AccordionContent()` --calls--> `cn()`  [EXTRACTED]
  src/renderer/components/ui/accordion.tsx → src/renderer/components/ui/utils.ts
- `AlertDialogOverlay()` --calls--> `cn()`  [EXTRACTED]
  src/renderer/components/ui/alert-dialog.tsx → src/renderer/components/ui/utils.ts
- `AlertDialogContent()` --calls--> `cn()`  [EXTRACTED]
  src/renderer/components/ui/alert-dialog.tsx → src/renderer/components/ui/utils.ts

## Import Cycles
- None detected.

## Communities (62 total, 1 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.03
Nodes (67): dependencies, better-sqlite3, canvas-confetti, class-variance-authority, clsx, cmdk, d3, date-fns (+59 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (42): Input(), Separator(), Sheet(), SheetContent(), SheetDescription(), SheetFooter(), SheetHeader(), SheetOverlay() (+34 more)

### Community 2 - "Community 2"
Cohesion: 0.10
Nodes (18): AlertDialogAction(), AlertDialogCancel(), AlertDialogContent(), AlertDialogDescription(), AlertDialogFooter(), AlertDialogHeader(), AlertDialogOverlay(), AlertDialogTitle() (+10 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (38): author, description, devDependencies, concurrently, electron, electron-builder, jsdom, tailwindcss (+30 more)

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (38): Avatar(), AvatarFallback(), AvatarImage(), Card(), CardAction(), CardContent(), CardDescription(), CardFooter() (+30 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (35): AgentItem, ConnectionStatus, inputStyle, labelStyle, MODELS, normalizeServiceUrl(), ProviderChainItem, ProviderOption (+27 more)

### Community 6 - "Community 6"
Cohesion: 0.06
Nodes (26): AgentStallDialog(), AgentStallDialogProps, AgentActivityCard(), ChatArea(), ChatAreaProps, MemoizedMessageItem, MemoizedWhisperBlock, Message (+18 more)

### Community 7 - "Community 7"
Cohesion: 0.07
Nodes (16): Checkbox(), HoverCardContent(), InputOTP(), InputOTPGroup(), InputOTPSlot(), Progress(), ResizableHandle(), ResizablePanelGroup() (+8 more)

### Community 8 - "Community 8"
Cohesion: 0.08
Nodes (24): build, appId, directories, dmg, electronVersion, extraResources, files, linux (+16 more)

### Community 9 - "Community 9"
Cohesion: 0.09
Nodes (21): compilerOptions, allowJs, allowSyntheticDefaultImports, baseUrl, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, jsx (+13 more)

### Community 10 - "Community 10"
Cohesion: 0.13
Nodes (17): DebateResultsProps, DebateAgentResponseProps, DebateRoundContent(), DebateRoundContentProps, DebateRoundTab(), DebateRoundTabProps, buildCitationCorrectionPrompt(), buildWithheldCitationResponse() (+9 more)

### Community 11 - "Community 11"
Cohesion: 0.20
Nodes (12): buildMandatoryCrossChecks(), ChatExecutionPolicy, CompletedAgentResult, CrossCheckRequest, getChatExecutionPolicy(), getRecoverableAgentRunId(), INDEPENDENT_REVIEW_TERMS, requiresIndependentReview() (+4 more)

### Community 12 - "Community 12"
Cohesion: 0.19
Nodes (13): Carousel(), CarouselApi, CarouselContent(), CarouselContext, CarouselContextProps, CarouselItem(), CarouselNext(), CarouselOptions (+5 more)

### Community 13 - "Community 13"
Cohesion: 0.12
Nodes (9): ContextMenuCheckboxItem(), ContextMenuContent(), ContextMenuItem(), ContextMenuLabel(), ContextMenuRadioItem(), ContextMenuSeparator(), ContextMenuShortcut(), ContextMenuSubContent() (+1 more)

### Community 14 - "Community 14"
Cohesion: 0.12
Nodes (9): DropdownMenuCheckboxItem(), DropdownMenuContent(), DropdownMenuItem(), DropdownMenuLabel(), DropdownMenuRadioItem(), DropdownMenuSeparator(), DropdownMenuShortcut(), DropdownMenuSubContent() (+1 more)

### Community 15 - "Community 15"
Cohesion: 0.12
Nodes (12): BottomBar(), STATUS_COLORS, StatusDot, LoginScreen(), LoginScreenProps, StartupScreenProps, TopBar(), AgentConfig (+4 more)

### Community 16 - "Community 16"
Cohesion: 0.14
Nodes (13): 1. Vision & Identity, 2.1 Parallel Orchestration (The Swarm), 2.2 Relational Persistence (SQLite Engine), 2.3 Visual-First Intelligence, 2.4 Secure IPC Bridge, 2. Core Architectural Pillars, 3.1 Workspace Authorization, 3.2 Session Lifecycle (+5 more)

### Community 17 - "Community 17"
Cohesion: 0.20
Nodes (11): FormControl(), FormDescription(), FormFieldContext, FormFieldContextValue, FormItem(), FormItemContext, FormItemContextValue, FormLabel() (+3 more)

### Community 18 - "Community 18"
Cohesion: 0.13
Nodes (17): AgentRunControl, agentRunControls, createTray(), createWindow(), getGatewayConnection(), getGatewayProviders(), LOG_FILE, MCP_TOOL_ROUTES (+9 more)

### Community 19 - "Community 19"
Cohesion: 0.18
Nodes (10): AI flow, AI flow, Chat mode, Chat Modes and Debate, Debate orchestrator, Failure modes, Human flow, Human flow (+2 more)

### Community 20 - "Community 20"
Cohesion: 0.18
Nodes (10): AI usage, AI usage, Failure modes, Human flow, Human flow, Key surfaces, Left sidebar, Purpose (+2 more)

### Community 21 - "Community 21"
Cohesion: 0.18
Nodes (10): Architecture, Build, Development, Features, Getting Started, Installation, License, Prerequisites (+2 more)

### Community 22 - "Community 22"
Cohesion: 0.22
Nodes (8): ChartConfig, ChartContainer(), ChartContext, ChartContextProps, ChartLegendContent(), ChartTooltipContent(), THEMES, useChart()

### Community 23 - "Community 23"
Cohesion: 0.18
Nodes (6): DrawerContent(), DrawerDescription(), DrawerFooter(), DrawerHeader(), DrawerOverlay(), DrawerTitle()

### Community 24 - "Community 24"
Cohesion: 0.18
Nodes (7): SelectContent(), SelectItem(), SelectLabel(), SelectScrollDownButton(), SelectScrollUpButton(), SelectSeparator(), SelectTrigger()

### Community 25 - "Community 25"
Cohesion: 0.15
Nodes (13): 16.10 Dense List Example, 16.11 Modal Example, 16.12 What Good Looks Like, 16.1 Global Shell, 16.2 Top Header Example, 16.3 Left Rail Example, 16.4 Right Rail Example, 16.5 Workspace Detail Example (+5 more)

### Community 26 - "Community 26"
Cohesion: 0.13
Nodes (11): ActionBar(), ActionBarProps, SessionModal(), SessionModalProps, GROUPING_STOP_WORDS, GroupingFolderInput, parseFolderClassification(), sanitizeSessionName() (+3 more)

### Community 27 - "Community 27"
Cohesion: 0.22
Nodes (9): NavigationMenu(), NavigationMenuContent(), NavigationMenuIndicator(), NavigationMenuItem(), NavigationMenuLink(), NavigationMenuList(), NavigationMenuTrigger(), navigationMenuTriggerStyle (+1 more)

### Community 28 - "Community 28"
Cohesion: 0.36
Nodes (3): MermaidEditorModal(), MermaidEditorModalProps, sanitizeMermaidCode()

### Community 29 - "Community 29"
Cohesion: 0.18
Nodes (10): AI flow, Chat and Agents, Citation contract, Failure modes, Human flow, Message types, Purpose, Relevant files (+2 more)

### Community 30 - "Community 30"
Cohesion: 0.20
Nodes (10): ChatModeSelectorProps, AthenaAgentSpec, AthenaRunPayload, AthenaService, AthenaThreadRecord, createAthenaService(), defaultStorage(), ChatMode (+2 more)

### Community 31 - "Community 31"
Cohesion: 0.15
Nodes (11): ChatItem, FolderItem, LeftSidebar(), LeftSidebarProps, ProfileModal(), ProfileModalProps, SettingsModal(), clearStoredApiKey() (+3 more)

### Community 32 - "Community 32"
Cohesion: 0.25
Nodes (7): AI usage, Architecture, Core persistence model, Failure boundaries, Human usage, Shared runtime contracts, System shape

### Community 33 - "Community 33"
Cohesion: 0.25
Nodes (7): AI flow, Authentication and Profile, Contracts, Failure modes, Human flow, Purpose, Relevant surfaces

### Community 34 - "Community 34"
Cohesion: 0.25
Nodes (7): AI flow, Data model, Failure modes, Human flow, Persistence details, Purpose, Session Storage

### Community 35 - "Community 35"
Cohesion: 0.25
Nodes (7): AI flow, Failure modes, Human flow, Icon pipeline, Main-process contract, Purpose, Startup and Packaging

### Community 36 - "Community 36"
Cohesion: 0.25
Nodes (7): AI flow, Failure modes, File handling, Human flow, Mermaid handling, Purpose, Summaries, Files, and Mermaid

### Community 37 - "Community 37"
Cohesion: 0.25
Nodes (3): electronProcess, isConcurrent, rootDir

### Community 38 - "Community 38"
Cohesion: 0.17
Nodes (11): 10. Motion, 11. Forge-Specific Product Framing, 12. Implementation Notes, 13. What Forge Should Not Look Like, 14. Reference Alignment, 15. Design Checklist, 1. Design Direction, 2. App Shell (+3 more)

### Community 39 - "Community 39"
Cohesion: 0.29
Nodes (6): Documentation rule, Release History, v4 baseline, v5.0.0, v5.0.2, v5.0.3

### Community 40 - "Community 40"
Cohesion: 0.29
Nodes (6): compilerOptions, allowSyntheticDefaultImports, composite, module, moduleResolution, include

### Community 41 - "Community 41"
Cohesion: 0.28
Nodes (8): copyDir(), main(), projectRoot, stsbDestDir, stsbSourceDir, syncModel(), whisperDestDir, whisperSourceDir

### Community 42 - "Community 42"
Cohesion: 0.25
Nodes (6): BreadcrumbEllipsis(), BreadcrumbItem(), BreadcrumbLink(), BreadcrumbList(), BreadcrumbPage(), BreadcrumbSeparator()

### Community 43 - "Community 43"
Cohesion: 0.33
Nodes (5): Architecture, Development Workflows, Engineering Standards, Project Structure, Savant Quorum Project

### Community 44 - "Community 44"
Cohesion: 0.33
Nodes (5): localStorageMock, mockAgents, mockIpcRenderer, mockSessions, mockSystem

### Community 45 - "Community 45"
Cohesion: 0.38
Nodes (6): downloadFile(), fileExists(), main(), modelFiles, modelRoot, projectRoot

### Community 47 - "Community 47"
Cohesion: 0.40
Nodes (4): Document set, How to use, Savant Quorum Memory Bank, Update rule

### Community 48 - "Community 48"
Cohesion: 0.50
Nodes (4): Alert(), AlertDescription(), AlertTitle(), alertVariants

### Community 49 - "Community 49"
Cohesion: 0.29
Nodes (7): 3.1 Top Header, 3.2.1 Left Collapsible Panel, 3.2 Left Navigation Rail, 3.3 Center Workspace, 3.4 Right Context Rail, 3.5 Bottom Status Bar, 3. Layout Model

### Community 50 - "Community 50"
Cohesion: 0.50
Nodes (3): { app, BrowserWindow }, fs, path

### Community 52 - "Community 52"
Cohesion: 0.40
Nodes (5): downloadFile(), fileExists(), modelFiles, modelRoot, projectRoot

### Community 56 - "Community 56"
Cohesion: 0.33
Nodes (6): 6.1 Cards, 6.2 Tables and Lists, 6.3 Tabs and Subtabs, 6.4 Modals, 6.5 Toasts, 6. Component Patterns

### Community 57 - "Community 57"
Cohesion: 0.40
Nodes (5): 4.1 Overall Tone, 4.2 Typography, 4.3 Color, 4.4 Surfaces, 4. Visual Language

### Community 58 - "Community 58"
Cohesion: 0.40
Nodes (5): 7.1 Header, 7.2 Left Bar, 7.3 Right Bar, 7.4 Bottom Bar, 7. Shell-Specific Guidance

### Community 59 - "Community 59"
Cohesion: 0.40
Nodes (3): AccordionContent(), AccordionItem(), AccordionTrigger()

### Community 60 - "Community 60"
Cohesion: 0.50
Nodes (4): 9.1 Loading, 9.2 Empty States, 9.3 Error States, 9. State and Feedback

### Community 61 - "Community 61"
Cohesion: 0.67
Nodes (3): 5.1 Primary Hierarchy, 5.2 Secondary Hierarchy, 5. Navigation and Information Hierarchy

## Knowledge Gaps
- **370 isolated node(s):** `name`, `version`, `description`, `author`, `main` (+365 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `Community 4` to `Community 1`, `Community 2`, `Community 5`, `Community 7`, `Community 27`, `Community 42`, `Community 12`, `Community 13`, `Community 14`, `Community 48`, `Community 17`, `Community 22`, `Community 23`, `Community 24`, `Community 59`?**
  _High betweenness centrality (0.208) - this node is a cross-community bridge._
- **Why does `getStoredApiKey()` connect `Community 15` to `Community 5`, `Community 31`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Community 0` to `Community 3`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _370 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.029850746268656716 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05279034690799397 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.10461538461538461 - nodes in this community are weakly interconnected._