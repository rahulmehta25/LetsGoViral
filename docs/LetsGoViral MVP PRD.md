# LetsGoViral MVP — PRD

### TL;DR

LetsGoViral MVP helps content creators rapidly transform long-form videos into short, engaging clips with minimal manual work. The MVP provides AI-driven clipping, intuitive review, and simple export, reducing the time and friction in video repurposing. It’s targeted at solo creators, podcasters, and small content teams who want to maximize content reach without video editing expertise.

---

## Goals

### Business Goals

* Achieve 100+ unique creators uploading videos within 60 days of MVP launch.

* Maintain clip approval rate above 40% in the first 3 months post-launch.

* Achieve at least 70% of users returning to upload again within 30 days.

* Sustain operational costs per processed hour of video below $1 during MVP phase.

### User Goals

* Minimize time and effort required to produce viral-ready clips from long-form content.

* Eliminate the need for video editing skills to generate quality social-ready highlights.

* Enable rapid review and export of automatically generated clips.

* Empower small teams and individuals to repurpose content quickly for multiple platforms.

### Non-Goals

* No multi-user team management or collaboration features in the MVP.

* No integration with external publishing or scheduling platforms.

* No advanced customization (such as manual clip selection, styling, or re-editing) beyond basic approval/rejection.

---

## User Stories

### Solo Creator

* As a solo creator, I want to upload a full-length video and get suggested viral clips, so that I can reach new audiences without learning editing.

* As a solo creator, I want to easily approve the best AI-selected moments, so that I only share my strongest content.

* As a solo creator, I want to quickly download ready-to-post clips, so that I can share more often.

### Podcaster

* As a podcaster, I want to upload my episode and receive short clips, so that I can promote episodes on social media.

* As a podcaster, I want to check the clips before exporting, so that only quality moments are shared.

* As a podcaster, I want the process to be simple and consistent week-to-week, so that I can grow my audience efficiently.

### Content Team for Small Brand

* As a content manager, I want one place to drop our team’s full videos and pull out ready-to-share clips, so that our promotion workflow is faster.

* As a content manager, I want to download all approved clips at once, so that I can distribute them to my team.

---

## Functional Requirements

* **Upload & Ingestion (Priority: P0)**

  * Video Upload: Users must be able to drag-and-drop or select a video file (max 2GB, MP4/MOV).

  * Basic File Validation: The system validates file type, duration (<2 hours), and size.

* **Processing & Analysis (Priority: P0)**

  * Automated Clip Extraction: After upload, backend AI analyzes video and generates 3–7 short clips (15–90 seconds each) predicted to be the most viral.

  * Progress Indication: Display processing status and estimated time remaining.

* **Clip Review (Priority: P0)**

  * Clip List Review: Users see a list/thumbnails of generated clips with preview playback.

  * Approval/Rejection: Users can approve or reject each clip.

  * Basic Clip Details: Show relevant info (length, timestamp in source video).

* **Export & Download (Priority: P0)**

  * Download Approved Clips: Users can download each approved clip individually or as a zipped bundle.

  * Simple Confirmation: Clear messaging on export completion.

---

## User Experience

**Entry Point & First-Time User Experience**

* Users discover Let'sGoViral via a landing page or direct referral, with a prominent "Get Started" or "Upload Video" CTA.

* Users are prompted to sign up or start as a guest, followed by a concise 2-slide onboarding carousel: how auto-clipping works, what to expect, and privacy note.

* Dashboard initially displays an empty state with a clear upload prompt.

**Core Experience**

* **Step 1:** User uploads a video file via drag-and-drop or file picker.

  * UI restricts to supported formats (MP4, MOV) and prompts error messages for invalid uploads.

  * Progress bar confirms upload status.

  * On success, transitions to processing view.

* **Step 2:** Video is auto-processed; user sees processing indicator and ETA.

  * Option to receive an email when clips are ready.

  * UI blocks next actions until processing is finished.

* **Step 3:** Review screen displays list of generated clips as thumbnails with timestamps.

  * Each clip can be previewed in-browser with simple playback controls.

  * Clips have "Approve" and "Reject" buttons; status changes on click.

  * If user rejects all, prompt to revisit or try another file.

* **Step 4:** Export area summarizes approved clips and provides "Download All" (zip) or individual download links.

  * Success message appears when downloads are initiated.

  * Users can return to dashboard to process another video.

**Advanced Features & Edge Cases**

* If processing fails, users receive a granular error with a suggested action (retry, try another file, or contact support).

* Consolidated notification if no viable clips are generated.

* Power-users can process multiple files sequentially, but no batch upload.

* Clip limits: 10 per video, to limit cost and focus review.

* Sessions persist for 7 days; after which files/clips are deleted for privacy.

**UI/UX Highlights**

* Clear, minimal interface with accessible color palette and sufficient contrast.

* Mobile-responsive layout for review/export flows.

* Large, labeled action buttons for key workflows (upload, approve, download).

* Animated states (e.g., progress loader) for feedback.

* Accessibility: supports keyboard navigation, descriptive alt text, and readable font sizes.

---

## Narrative

Sarah, an independent podcaster with a growing but time-strapped audience, records weekly one-hour interviews. She knows short-form clips could help her go viral on TikTok and Instagram, but editing is tedious and expensive. After discovering LetsGoViral, she tries the beta: uploading her latest episode in minutes, she steps away to get coffee. When she returns, the app presents seven high-energy moments as previewable clips. She quickly reviews and approves four that fit her brand, downloads them in a single click, and shares them later that day. Her audience engagement jumps, and she now confidently promotes every episode with compelling highlight clips—all without learning or paying for video editing. LetsGoViral turns a time sink into a creative growth engine for both Sarah and the business.

---

## Success Metrics

* **Unique creators who upload at least one video within 60 days**

* **% of generated clips that are approved (approval rate)**

* **% of users who return to create more clips within 30 days**

* **Average time from upload to download of first clip**

* **Processing error rate (failures per video processed)**

* **Sustained operational cost per video processed**

### User-Centric Metrics

* Number of unique users who complete upload → review → download within 1 session

* Average number of clips approved per video

* User satisfaction via post-download survey (target: 80% "satisfied" or higher)

### Business Metrics

* Conversion rate from landing page to first upload

* Repeat user rate (users who process 2+ videos)

* Cost per processed video vs budgeted target

### Technical Metrics

* Video processing success rate (>95%)

* Clip generation time per hour of video (<20 min/hr)

* System uptime (>99%)

### Tracking Plan

* Video upload initiated/completed

* Processing started/finished

* Clip review: approve/reject actions

* Clips download (single and zip)

* Errors encountered

* User session length and recurrence

---

## Technical Considerations

### Technical Needs

* **Frontend:** Web app with upload, processing, review, and download interfaces.

* **Backend:** API endpoints for upload, job queue for video processing, AI clip extraction service, storage for temp files and generated clips.

* **Minimal Data Model:** Users, videos, clips (with status), sessions.

* **Processing:** Use off-the-shelf AI for first iteration (e.g., open-source or basic commercial models).

### Integration Points

* Cloud storage for uploaded videos and generated clips

* Third-party AI/ML service or open-source model for automated clip extraction

* Optional transactional email service for notification (out of scope if not trivial)

### Data Storage & Privacy

* User-uploaded videos and generated clips stored temporarily; delete all files after 7 days.

* HTTPS for all uploads/downloads.

* Privacy policy transparent about retention and deletion.

* No PII beyond necessary account/contact info.

### Scalability & Performance

* Target initial load: 100 simultaneous users, 20 concurrent video processes.

* Graceful queuing if overloaded; clear user notifications for delays.

### Potential Challenges

* Ensuring clip quality—balancing AI accuracy with speed.

* Managing compute/storage cost per video.

* Handling upload failures for large files.

* Preventing misuse/spam uploads.

---

## Milestones & Sequencing

### Project Estimate

* Medium: 2–4 weeks for MVP

### Team Size & Composition

* Small Team (2 people): 1 Product/Frontend engineer, 1 Backend/AI engineer

### Suggested Phases

**Phase 1: Prototype & UX (1 week)**

* Key Deliverables: Clickable Figma prototype (Product), basic upload/review flow stub (Frontend).

* Dependencies: Early access to sample videos for testing.

**Phase 2: Core Engineering & AI Integration (2 weeks)**

* Key Deliverables: Functional upload → processing → review → download pipeline (Engineering).

* Dependencies: Viable AI model for clip extraction, cloud storage account.

**Phase 3: Polish, QA, & Launch (1 week)**

* Key Deliverables: Polished UI/UX, bugfixes, user onboarding, error handling, and MVP privacy/data deletion enforcement.

* Dependencies: Feedback from internal alpha users, finalized resource limits.

---