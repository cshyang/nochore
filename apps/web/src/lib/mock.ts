import type { Project } from "./types";

export const PROJECTS: Project[] = [
  {
    id: "acme",
    name: "Acme Corp",
    icon: "🏢",
    color: "#6C5CE7",
    sharedTools: ["Google Ads", "Slack", "HubSpot"],
    agents: [
      { id: "ad-guardian", name: "Ad Spend Guardian", status: "attention", statusText: "Budget reallocation needs approval", lastRun: "2h ago", skills: 2, lessons: 14, confidence: 78, domain: "ads" },
      { id: "content-sched", name: "Content Scheduler", status: "attention", statusText: "3 posts ready for review", lastRun: "1h ago", skills: 3, lessons: 8, confidence: 62, domain: "content" },
      { id: "lead-qual", name: "Lead Qualifier", status: "running", statusText: "All clear", lastRun: "1h ago", skills: 2, lessons: 21, confidence: 88, domain: "leads" },
    ],
    attentionCount: 2,
  },
  {
    id: "brightside",
    name: "Brightside Health",
    icon: "🏥",
    color: "#34D399",
    sharedTools: ["Meta Ads", "Slack", "GA4"],
    agents: [
      { id: "meta-optimizer", name: "Meta Ad Optimizer", status: "running", statusText: "All clear", lastRun: "30m ago", skills: 3, lessons: 32, confidence: 91, domain: "ads" },
      { id: "funnel-monitor", name: "Funnel Monitor", status: "running", statusText: "All clear", lastRun: "2h ago", skills: 2, lessons: 15, confidence: 74, domain: "analytics" },
    ],
    attentionCount: 0,
  },
  {
    id: "internal",
    name: "Internal Ops",
    icon: "⚙️",
    color: "#FBBF24",
    sharedTools: ["Jira", "Slack", "GitHub"],
    agents: [
      { id: "invoice-tracker", name: "Invoice Tracker", status: "running", statusText: "All clear", lastRun: "30m ago", skills: 1, lessons: 5, confidence: 55, domain: "finance" },
      { id: "competitor-mon", name: "Competitor Monitor", status: "attention", statusText: "New competitor detected", lastRun: "6h ago", skills: 2, lessons: 11, confidence: 69, domain: "competitive" },
    ],
    attentionCount: 1,
  },
];
