import {
  LandingContent,
  LandingTemplate,
} from '@csv/templates/LandingTemplate';
import { NextPage } from 'next';

const content: LandingContent = {
  navbar: {
    title: 'CSV Browser',
    buttonText: 'Open Editor',
    buttonHref: '/app',
  },
  hero: {
    title: 'View, Edit, and Explore CSV Files Instantly',
    tagline:
      'A fast, privacy-first CSV browser and editor that runs entirely in your browser.',
    buttonText: 'Open CSV Editor',
    buttonHref: '/app',
  },
  features: {
    title: 'Features',
    items: [
      {
        id: 'instant-open',
        emoji: '📂',
        title: 'Instant CSV Loading',
        description:
          'Open CSV files instantly from your computer with no uploads required.',
      },
      {
        id: 'spreadsheet-editing',
        emoji: '✏️',
        title: 'Spreadsheet-Style Editing',
        description:
          'Edit rows and columns easily with a familiar spreadsheet-like interface.',
      },
      {
        id: 'sorting-filtering',
        emoji: '🔎',
        title: 'Sorting & Filtering',
        description:
          'Quickly sort and filter data to find the information you need.',
      },
      {
        id: 'privacy-first',
        emoji: '🔒',
        title: 'Privacy First',
        description:
          'Your CSV files stay in your browser. Nothing is uploaded or stored remotely.',
      },
      {
        id: 'large-files',
        emoji: '⚡',
        title: 'Handles Large Files',
        description:
          'Efficiently explore large CSV datasets without slowing down your browser.',
      },
      {
        id: 'export',
        emoji: '💾',
        title: 'Export & Download',
        description:
          'Save your edited CSV files instantly back to your device.',
      },
    ],
  },
  cta: {
    title: 'Open and Edit CSV Files in Seconds',
    description:
      'A lightweight CSV viewer and editor built for speed, privacy, and simplicity.',
    buttonText: 'Open CSV Editor',
    buttonHref: '/app',
  },
  footer: {
    name: 'CSV Browser',
  },
};

const HomePage: NextPage = () => {
  return <LandingTemplate content={content} />;
};

export default HomePage;
