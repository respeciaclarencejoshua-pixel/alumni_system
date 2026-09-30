import { useMessageInputSize } from '../lib/useMessageInputSize.js';
import MediaPickerButton from './MediaPickerButton.jsx';
import { createAsyncCache } from '../../../shared/asyncCache.mjs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import './Chat.css';
import {ChatMenu, ChatCover, useChatSettings, mediaUrl} from './ChatExtras.jsx';
import BatchConversation from './BatchConversation.jsx';
import DirectMessageBubble from './DirectMessageBubble.jsx';
import { faqs } from './HelpCenter.jsx';

function getHelpAnswer(question) {
  const normalized = question.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/\b(profile picture|profile photo|profile pic|avatar)\b/.test(normalized) || /\b(change|update|upload|add|replace)\b.{0,35}\b(picture|photo|pic|avatar)\b/.test(normalized)) {
    return faqs.find(item => item.q === 'How do I update my profile picture?') || null;
  }
  const aliases = {
    password: ['forgot password', 'reset password', 'sign in', 'login', 'log in', 'locked out'],
    profile: ['account details', 'personal information', 'edit account', 'change my name', 'profile picture', 'avatar'],
    verification: ['verify', 'verified', 'pending', 'rejected', 'approval', 'alumni status'],
    batch: ['batch group', 'class group', 'join group', 'leave group', 'class year'],
    chat: ['message', 'messaging', 'direct message', 'group chat', 'block', 'report user'],
    document: ['certificate', 'transcript', 'school record', 'official paper'],
    request: ['support ticket', 'contact office', 'reply', 'status', 'private request', 'help request'],
    portal: ['error', 'not loading', 'broken', 'bug', 'technical problem', 'website issue']
  };
  const expanded = new Set(normalized.split(' ').filter(word => word.length > 2));
  Object.entries(aliases).forEach(([term, phrases]) => {
    if (phrases.some(phrase => normalized.includes(phrase))) expanded.add(term);
  });
  const words = [...expanded];
  const ranked = faqs.map(item => {
    const title = item.q.toLowerCase();
    const text = `${item.q} ${item.a}`.toLowerCase();
    const score = words.reduce((total, word) => total + (title.includes(word) ? 3 : text.includes(word) ? 1 : 0), 0);
    const phraseMatch = normalized.length > 5 && (title.includes(normalized) || normalized.includes(title.replace(/[?]/g, '').toLowerCase()));
    return { ...item, score: score + (phraseMatch ? 5 : 0) };
  }).sort((a, b) => b.score - a.score);
  const minimum = words.length < 2 ? 4 : words.length < 4 ? 3 : 4;
  const runnerUp = ranked[1]?.score || 0;
  return ranked[0]?.score >= minimum && ranked[0].score > runnerUp ? ranked[0] : null;
}

const nameOf = (p) => [p?.first_name, p?.last_name].filter(Boolean).join(' ').trim() || 'Alumni member';
const initialsOf = (p) => `${p?.first_name?.[0] || ''}${p?.last_name?.[0] || ''}`.toUpperCase() || 'A';
const HELP_HISTORY_TTL = 24 * 60 * 60 * 1000;
const helpHistoryKey = userId => `nddu-alumni-help-history:${userId}`;
const welcomeHelpMessage = () => ({ id: 'welcome', from: 'bot', text: 'Hi! Ask me about your account, verification, batch groups, chats, documents, support requests, or portal problems. You can also tap one of the common questions below.' });
function restoreHelpHistory(userId) {
  try {
    const key = helpHistoryKey(userId);
    const stored = JSON.parse(localStorage.getItem(key) || 'null');
    if (stored && Date.now() - stored.lastActivity < HELP_HISTORY_TTL && Array.isArray(stored.messages) && stored.messages.length) return stored;
    localStorage.removeItem(key);
  } catch { /* Storage may be unavailable; keep the chat in memory for this visit. */ }
  return { messages: [welcomeHelpMessage()], lastActivity: Date.now() };
}

function Avatar({ person, small = false }) {
  return <span className={`chat-avatar ${small ? 'small' : ''}`}>{person?.avatar_url ? <img src={person.avatar_url} alt="" /> : initialsOf(person)}</span>;
}

const helpWalkthroughs = {
  profilePicture: { name: 'change your profile picture', steps: [
    { title: '1. Open your profile', text: 'Open the account menu and select the My alumni account card that shows your name and email. This opens your Profile page.', icon: '☰', target: 'My alumni account' },
    { title: '2. Edit your profile', text: 'On your profile page, select Edit profile. The Edit alumni profile window will open.', icon: '✎', target: 'Edit profile' },
    { title: '3. Choose a picture file', text: 'Find Profile picture and select Choose picture. Your device’s file picker opens. Pick a JPG, PNG, or WebP image no larger than 2 MB, then check the preview.', icon: '＋', target: 'Choose picture' },
    { title: '4. Save changes', text: 'At the bottom of the Edit alumni profile window, select Save changes. Wait for the success message.', icon: '✓', target: 'Save changes' }
  ] },
  joinBatch: { name: 'find and open your batch group chat', steps: [
    { title: '1. Open Chats', text: 'Select the green chat button in the lower-right corner. The Chats panel opens.', icon: '☰', target: 'Green chat button' },
    { title: '2. Look under Your batch chats', text: 'Your joined batch groups appear directly in this directory. Select your batch name to open its group conversation.', icon: '◉', target: 'Batch name' },
    { title: '3. Open Directory', text: 'If your batch is not listed, open Menu on a phone and select Directory. On a computer, select Directory in the site navigation.', icon: '☰', target: 'Directory' },
    { title: '4. Browse batch groups', text: 'On Alumni directory, find “Looking for your batch?” and select Browse batch groups.', icon: '➜', target: 'Browse batch groups' },
    { title: '5. Search for your batch', text: 'On Alumni batch groups, use Find a batch. Search by batch name, year, or president.', icon: '⌕', target: 'Find a batch' },
    { title: '6. Open the matching batch', text: 'Check the batch name, class year, and president on the matching card. Select View batch.', icon: '◉', target: 'View batch' },
    { title: '7. Join the batch', text: 'On the batch overview, confirm it is the right batch and select Join batch. A verified alumni account is required.', icon: '＋', target: 'Join batch' },
    { title: '8. Open its group chat', text: 'Return to the green Chats button. Your joined batch now appears under Your batch chats. Select its name there to open the conversation.', icon: '✓', target: 'Batch name' }
  ] },
  leaveBatch: { name: 'leave a batch group', steps: [
    { title: '1. Open Directory', text: 'In the site navigation, select Directory.', icon: '☰', target: 'Directory' },
    { title: '2. Browse batch groups', text: 'On Alumni directory, select Browse batch groups in the “Looking for your batch?” panel.', icon: '➜', target: 'Browse batch groups' },
    { title: '3. Open your joined batch', text: 'On Alumni batch groups, select the batch card marked Joined.', icon: '◉', target: 'Joined' },
    { title: '4. Open About & rules', text: 'In the batch page tabs, select About & rules. Scroll to Your membership.', icon: '▤', target: 'About & rules' },
    { title: '5. Select Leave batch', text: 'Select Leave batch. The browser asks you to confirm that you will also lose access to the group chat.', icon: '−', target: 'Leave batch' },
    { title: '6. Confirm leaving', text: 'Choose OK in the browser confirmation to leave. Choose Cancel if you want to stay.', icon: '✓', target: 'OK' }
  ] },
  submitRequest: { name: 'send a request to the alumni office', steps: [
    { title: '1. Open your account menu', text: 'Select Account or your name at the top of the page.', icon: '☰', target: 'Account' },
    { title: '2. Open Help & support', text: 'In the account menu, select Help & support.', icon: '?', target: 'Help & support' },
    { title: '3. Choose a help topic', text: 'Select Get help on the topic closest to your question.', icon: '◉', target: 'Get help' },
    { title: '4. Describe your question', text: 'Enter a Subject and Describe your request. Do not include your password or payment details.', icon: '✎', target: 'Subject' },
    { title: '5. Send your request', text: 'Select Submit request. Find the conversation later in My requests on the same page.', icon: '✓', target: 'Submit request' }
  ] },
  checkRequest: { name: 'check a request or reply', steps: [
    { title: '1. Open your account menu', text: 'Select Account or your name at the top of the page.', icon: '☰', target: 'Account' },
    { title: '2. Open Help & support', text: 'In the account menu, select Help & support.', icon: '?', target: 'Help & support' },
    { title: '3. Find My requests', text: 'Scroll down to My requests to see requests you have sent.', icon: '⌕', target: 'My requests' },
    { title: '4. Open the conversation', text: 'Select View conversation on the request you want to check.', icon: '◉', target: 'View conversation' },
    { title: '5. Read or reply', text: 'Read the alumni office reply. To add details, enter them in Your reply and select Send reply.', icon: '✎', target: 'Your reply' },
    { title: '6. Refresh the request', text: 'Return to My requests and select Check for updates to load the latest status and replies.', icon: '↻', target: 'Check for updates' }
  ] },
  sendMessage: { name: 'send a message to another alumnus', steps: [
    { title: '1. Open Chats', text: 'Select the green chat button to open the Chats panel.', icon: '☰', target: 'Chats' },
    { title: '2. Find the alumnus', text: 'Use Search alumni or batch, or scroll to Direct messages.', icon: '⌕', target: 'Search alumni' },
    { title: '3. Open the conversation', text: 'Select the person’s name to open your private conversation.', icon: '◉', target: 'Alumni member' },
    { title: '4. Type your message', text: 'Select the message box, type your message, and review it before sending.', icon: '✎', target: 'Aa' },
    { title: '5. Send the message', text: 'Select Send to deliver the message. It appears in the conversation.', icon: '➤', target: 'Send' }
  ] },
  chatHelp: { name: 'troubleshoot alumni chat', steps: [
    { title: '1. Open Chats', text: 'Select the green chat button. If you are signed in and verified, the Chats panel opens.', icon: '☰', target: 'Chats' },
    { title: '2. Search for a person or batch', text: 'Use Search alumni or batch. Batch chat is available after you join that batch.', icon: '⌕', target: 'Search alumni or batch' },
    { title: '3. Open the conversation', text: 'Select a person under Direct messages or a joined batch under Your batch chats.', icon: '◉', target: 'Direct messages / Your batch chats' },
    { title: '4. Ask the office if still stuck', text: 'If chat does not load or send, open Help & support and submit a request with the error message.', icon: '✓', target: 'Help & support' }
  ] },
  blockMember: { name: 'block an alumnus', steps: [
    { title: '1. Open the conversation', text: 'Open Chats and select the person under Direct messages.', icon: '☰', target: 'Direct messages' },
    { title: '2. Open conversation options', text: 'In the conversation header, open the chat options menu.', icon: '⋮', target: 'Conversation options' },
    { title: '3. Choose Block alumnus', text: 'In the safety section, select Block alumnus. The menu says this stops messages from this person.', icon: '⊘', target: 'Block alumnus' },
    { title: '4. Confirm the block', text: 'Select OK in the browser prompt showing the person’s name. The conversation will close and the person is removed from your chat list.', icon: '✓', target: 'OK' }
  ] },
  editProfile: { name: 'edit your profile details', steps: [
    { title: '1. Open your profile', text: 'Open the account menu and select the My alumni account card that shows your name and email. This opens your Profile page.', icon: '☰', target: 'My alumni account' },
    { title: '2. Select Edit profile', text: 'On your profile page, select Edit profile.', icon: '✎', target: 'Edit profile' },
    { title: '3. Update your details', text: 'Change the fields you can edit in the Edit alumni profile form. Some alumni record details may need an office correction request.', icon: '✎', target: 'Profile details' },
    { title: '4. Save changes', text: 'Select Save changes at the bottom and wait for the saved message.', icon: '✓', target: 'Save changes' }
  ] },
  passwordReset: { name: 'reset your password', steps: [
    { title: '1. Open Log in', text: 'Open the sign-in screen for NDDU Alumni.', icon: '☰', target: 'Log in' },
    { title: '2. Select Forgot password?', text: 'This link is below the Log in button.', icon: '?', target: 'Forgot password?' },
    { title: '3. Enter your email', text: 'On Reset your password, enter the email address linked to your account.', icon: '✉', target: 'Email' },
    { title: '4. Send the reset link', text: 'Select Send reset link. The portal sends a secure link to that email address.', icon: '✓', target: 'Send reset link' },
    { title: '5. Check your email', text: 'Open the reset email and follow its secure link. Check your spam folder if it is missing.', icon: '✓', target: 'Email inbox' }
  ] },
  register: { name: 'create an NDDU Alumni account', steps: [
    { title: '1. Open Create an account', text: 'On Welcome back, choose Create an account at the bottom of the sign-in form.', icon: '☰', target: 'Create an account' },
    { title: '2. Enter your name and email', text: 'On Create your account, fill in First Name, Last Name, and Email.', icon: '✎', target: 'First Name' },
    { title: '3. Make a password', text: 'Fill in Password and Confirm Password. Follow all four Password requirements shown on the form.', icon: '✎', target: 'Password' },
    { title: '4. Add alumni education details', text: 'Keep Alumni selected. Scroll down to Education Information, then select Department / College, Course / Program, and Graduation Year. Degree fills automatically. Batch Name is optional.', icon: '✎', target: 'Education Information' },
    { title: '5. Agree and create your account', text: 'Accept the Terms of Service and Privacy Policy, complete the security check, and select Create Alumni Account. Check your email to confirm; your profile will be pending alumni verification.', icon: '✓', target: 'Create Alumni Account' }
  ] },
  verification: { name: 'submit alumni verification', steps: [
    { title: '1. Open the account menu', text: 'Sign in and open the account menu. Select Verify alumni status.', icon: '☰', target: 'Verify alumni status' },
    { title: '2. Enter graduation details', text: 'In the Alumni verification window, enter your graduation name, date, batch name, and program.', icon: '✎', target: 'Name used while studying' },
    { title: '3. Attach evidence', text: 'Choose a PDF, JPG, or PNG graduation certificate, transcript, or alumni record. Maximum file size is 10 MB.', icon: '＋', target: 'Choose file' },
    { title: '4. Submit and wait', text: 'Select Submit for verification. Your status will show Under review while the alumni office reviews it.', icon: '✓', target: 'Submit for verification' }
  ] },
  documents: { name: 'ask about an official document', steps: [
    { title: '1. Open your account menu', text: 'Select Account or your name at the top of the page.', icon: '☰', target: 'Account' },
    { title: '2. Open Help & support', text: 'In the account menu, select Help & support.', icon: '?', target: 'Help & support' },
    { title: '3. Choose Documents & requests', text: 'On the Help & support page, find Documents & requests and select Get help.', icon: '▤', target: 'Documents & requests' },
    { title: '4. Describe the document', text: 'Enter a Subject and describe the certificate, transcript, or other document you need. The office will explain the process.', icon: '✎', target: 'Subject' },
    { title: '5. Submit the inquiry', text: 'Select Submit request. The inquiry asks for guidance; it does not issue the document.', icon: '✓', target: 'Submit request' }
  ] },
  portalIssue: { name: 'report a portal problem', steps: [
    { title: '1. Open your account menu', text: 'Select Account or your name at the top of the page.', icon: '☰', target: 'Account' },
    { title: '2. Open Help & support', text: 'In the account menu, select Help & support.', icon: '?', target: 'Help & support' },
    { title: '3. Choose Using the alumni portal', text: 'Select Get help on the Using the alumni portal card.', icon: '▣', target: 'Using the alumni portal' },
    { title: '4. Explain what happened', text: 'Enter a Subject and describe what you were doing, what you expected, and the error message. Add your device or browser if known.', icon: '✎', target: 'Describe your request' },
    { title: '5. Send the request', text: 'Select Submit request. Find the conversation later under My requests.', icon: '✓', target: 'Submit request' }
  ] },
  statusGuide: { name: 'understand your request status', steps: [
    { title: '1. Open your account menu', text: 'Select Account or your name at the top of the page.', icon: '☰', target: 'Account' },
    { title: '2. Open Help & support', text: 'In the account menu, select Help & support.', icon: '?', target: 'Help & support' },
    { title: '3. Find your request', text: 'Scroll to My requests. Read the status shown beside your request subject.', icon: '⌕', target: 'My requests' },
    { title: '4. Open the request', text: 'If the status says Needs information, select View conversation on that request.', icon: '◉', target: 'View conversation' },
    { title: '5. Read the reply', text: 'In the conversation, read the alumni office reply. Add the requested details in Your reply and select Send reply.', icon: '✎', target: 'Your reply' },
    { title: '6. Refresh the status', text: 'Return to My requests and select Check for updates to load the latest status.', icon: '↻', target: 'Check for updates' }
  ] },
  privacy: { name: 'keep a support request private', steps: [
    { title: '1. Open your account menu', text: 'Select Account or your name at the top of the page.', icon: '☰', target: 'Account' },
    { title: '2. Open Help & support', text: 'In the account menu, select Help & support. Requests and replies are visible to you and authorized administrators.', icon: '?', target: 'Help & support' },
    { title: '3. Use a support request', text: 'Choose a help topic and submit details in its request form, not in a public post or group chat.', icon: '▣', target: 'Contact alumni office' },
    { title: '4. Leave out sensitive details', text: 'Never include your password, payment details, or identity documents in a request.', icon: '!', target: 'Describe your request' },
    { title: '5. Follow the conversation', text: 'Return to My requests to read replies and add safe follow-up details.', icon: '✓', target: 'My requests' }
  ] },
  portalNavigation: { name: 'find a feature on your phone', steps: [
    { title: '1. Open the site menu', text: 'On a phone, select Menu at the top of the page to open the site navigation.', icon: '☰', target: 'Menu' },
    { title: '2. Open the Directory', text: 'Choose Directory in the site menu to find alumni and batch groups.', icon: '⌕', target: 'Directory' },
    { title: '3. Open Chats', text: 'Close the site menu if needed, then select the green chat button in the lower-right corner. Chats is opened from this button.', icon: '☝', target: 'Green chat button' },
    { title: '4. Open Help & support', text: 'Select Account or your name in the page header, then choose Help & support from the account menu.', icon: '?', target: 'Help & support' },
    { title: '5. Ask for help if stuck', text: 'Choose a topic and include your phone model and browser in the request.', icon: '✓', target: 'Contact alumni office' }
  ] },
  helpCenter: { name: 'find help in the portal', steps: [
    { title: '1. Open your account menu', text: 'Select Account or your name at the top of the page.', icon: '☰', target: 'Account' },
    { title: '2. Open Help & support', text: 'In the account menu, select Help & support.', icon: '?', target: 'Help & support' },
    { title: '3. Choose a topic', text: 'Select Get help on Account & profile, Alumni records, Documents & requests, or Using the alumni portal.', icon: '⌕', target: 'Get help' },
    { title: '4. Read a FAQ', text: 'Scroll to Frequently asked questions and open the question that matches your problem.', icon: '?', target: 'Frequently asked questions' },
    { title: '5. Contact the office', text: 'If the answer does not solve it, select Contact alumni office and send a private request.', icon: '✓', target: 'Contact alumni office' }
  ] }
};

const walkthroughScreens = {
  profilePicture: [
    { heading: 'Account menu', controls: ['My alumni account · your name and email', 'Profile settings', 'Verify alumni status'] },
    { heading: 'My alumni profile', controls: ['Posts', 'About', 'Friends', 'Edit profile'] },
    { heading: 'Edit alumni profile', controls: ['Profile picture', 'JPG, PNG, or WebP · maximum 2 MB', 'Choose picture', 'First name', 'Last name'] },
    { heading: 'Edit alumni profile', controls: ['Cover photo', 'Profile picture', 'First name', 'Last name', 'Save changes', 'Cancel'] }
  ],
  editProfile: [
    { heading: 'Account menu', controls: ['My alumni account · your name and email', 'Profile settings', 'Verify alumni status'] },
    { heading: 'My alumni profile', controls: ['Posts', 'About', 'Friends', 'Edit profile'] },
    { heading: 'Edit alumni profile', controls: ['First name', 'Last name', 'Degree', 'Course / program', 'Department', 'Graduation year', 'Batch name', 'Honors'] },
    { heading: 'Edit alumni profile', controls: ['Cancel', 'Save changes'] }
  ],
  passwordReset: [
    { heading: 'Welcome back', controls: ['Email', 'Password', 'Log in', 'Forgot password?', 'Create an account'] },
    { heading: 'Welcome back', controls: ['Forgot password?'] },
    { heading: 'Reset your password', controls: ['Email', 'Send reset link', 'Back to login'] },
    { heading: 'Reset your password', controls: ['Email', 'Send reset link', 'Back to login'] },
    { heading: 'Outside the portal: your email app', controls: ['Check the email inbox for your account', 'If the email is missing, check spam'] }
  ],
  register: [
    { heading: 'Welcome back', controls: ['Email', 'Password', 'Log in', 'Forgot password?', 'Create an account'] },
    { heading: 'Create your account', controls: ['Account Information', 'First Name', 'Last Name', 'Email'] },
    { heading: 'Create your account', controls: ['Password', 'Confirm Password', 'Password requirements', 'At least 12 characters', 'One uppercase letter', 'One lowercase letter', 'One number'] },
    { heading: 'Create your account', controls: ['How will you use AlumniConnect?', 'Alumni', 'Employer / Recruiter', 'Education Information', 'Department / College', 'Course / Program', 'Degree', 'Graduation Year', 'Batch Name'] },
    { heading: 'Create your account', controls: ['Terms of Service', 'Privacy Policy', 'Create Alumni Account', 'Already have an account? Log in'] }
  ],
  verification: [
    { heading: 'Account menu', controls: ['My alumni account', 'Alumni not verified', 'Verify alumni status'] },
    { heading: 'Alumni verification', controls: ['Name used while studying', 'Graduation date', 'Batch name', 'Course or program'] },
    { heading: 'Alumni verification', controls: ['Graduation evidence', 'Choose file', 'Degree certificate, transcript, or official alumni record', 'PDF, JPG, or PNG · maximum 10 MB'] },
    { heading: 'Alumni verification', controls: ['Submit for verification', 'Under review'] }
  ],
  joinBatch: [
    { heading: 'Alumni portal', controls: ['Green chat button', 'Chats panel'] },
    { heading: 'Chats', controls: ['Search alumni or batch', 'Your batch chats', 'Batch name · [member count] batch members', 'Help assistant', 'Direct messages'] },
    { heading: 'Site menu', controls: ['Home', 'About NDDU', 'Community', 'Directory', 'Opportunities', 'Events', 'Gallery'] },
    { heading: 'Alumni directory', controls: ['Looking for your batch?', 'Find your batch community, members, and group chat.', 'Browse batch groups →'] },
    { heading: 'Alumni batch groups', controls: ['Find a batch', 'Batch name, year, or president', 'Batch group cards'] },
    { heading: 'Alumni batch groups', controls: ['Find a batch', 'View batch →'] },
    { heading: 'Batch overview', controls: ['Batch name', 'Class of [year] · [member count] members', 'Batch president: [name]', 'Join batch'] },
    { heading: 'Chats', controls: ['Your batch chats', 'Batch name · [member count] batch members', 'Help assistant', 'Direct messages'] }
  ],
  leaveBatch: [
    { heading: 'NDDU ALUMNI', controls: ['Directory', 'Feed', 'Events', 'Gallery'] },
    { heading: 'Alumni directory', controls: ['Looking for your batch?', 'Browse batch groups →'] },
    { heading: 'Alumni batch groups', controls: ['Find a batch', 'Batch name, year, or president', 'Batch card · Joined'] },
    { heading: 'Batch overview', controls: ['Announcements', 'Members', 'About & rules'] },
    { heading: 'About this batch', controls: ['About this batch', 'Community rules', 'Your membership', 'Leave batch'] },
    { heading: 'Browser confirmation', controls: ['Leave this batch? You will also lose access to its group chat.', 'Cancel', 'OK'] }
  ],
  sendMessage: [
    { heading: 'Chats', controls: ['Search alumni or batch', 'Your batch chats', 'Direct messages'] },
    { heading: 'Chats', controls: ['Search alumni or batch', 'Direct messages', 'Alumni member'] },
    { heading: 'Chats', controls: ['Direct messages', 'Alumni member'] },
    { heading: 'Alumni member', controls: ['Aa', 'Send'] },
    { heading: 'Alumni member', controls: ['Aa', 'Send'] }
  ],
  blockMember: [
    { heading: 'Chats', controls: ['Direct messages', 'Alumni member'] },
    { heading: 'Alumni member', controls: ['Registered alumni', 'Conversation options'] },
    { heading: 'Conversation options', controls: ['Shared in this chat', 'Personalize', 'Block alumnus', 'Stop messages from this person'] },
    { heading: 'Browser confirmation', controls: ['Block [alumnus name]?', 'Cancel', 'OK'] }
  ],
  chatHelp: [
    { heading: 'Chats', controls: ['Search alumni or batch', 'Your batch chats', 'Direct messages'] },
    { heading: 'Chats', controls: ['Search alumni or batch', 'Your batch chats', 'Direct messages'] },
    { heading: 'Chats', controls: ['Your batch chats', 'Direct messages'] },
    { heading: 'Help & support', controls: ['Using the alumni portal', 'Contact alumni office'] }
  ],
  submitRequest: [
    { heading: 'NDDU Alumni', controls: ['Account · your name'] },
    { heading: 'Account menu', controls: ['My alumni account', 'Profile settings', 'Help & support', 'Sign out'] },
    { heading: 'Help & support', controls: ['Account & profile · Get help', 'Alumni records · Get help', 'Documents & requests · Get help', 'Using the alumni portal · Get help'] },
    { heading: 'Contact the alumni office', controls: ['What do you need help with?', 'Subject', 'Describe your request'] },
    { heading: 'Contact the alumni office', controls: ['Submit request', 'My requests'] }
  ],
  checkRequest: [
    { heading: 'NDDU Alumni', controls: ['Account · your name'] },
    { heading: 'Account menu', controls: ['My alumni account', 'Profile settings', 'Help & support', 'Sign out'] },
    { heading: 'My requests', controls: ['Search requests', 'Request subject', 'Submitted / Being reviewed / Needs information / Completed'] },
    { heading: 'My requests', controls: ['Request subject · Needs information', 'View conversation'] },
    { heading: 'Request conversation', controls: ['Conversation', 'Your reply', 'Send reply'] },
    { heading: 'My requests', controls: ['Check for updates', 'View conversation'] }
  ],
  documents: [
    { heading: 'NDDU Alumni', controls: ['Account · your name'] },
    { heading: 'Account menu', controls: ['My alumni account', 'Profile settings', 'Help & support', 'Sign out'] },
    { heading: 'Help & support', controls: ['Documents & requests · Get help'] },
    { heading: 'Contact the alumni office', controls: ['What do you need help with?', 'Subject', 'Describe your request'] },
    { heading: 'Contact the alumni office', controls: ['Submit request'] }
  ],
  portalIssue: [
    { heading: 'NDDU Alumni', controls: ['Account · your name'] },
    { heading: 'Account menu', controls: ['My alumni account', 'Profile settings', 'Help & support', 'Sign out'] },
    { heading: 'Help & support', controls: ['Using the alumni portal · Get help'] },
    { heading: 'Contact the alumni office', controls: ['What do you need help with?', 'Subject', 'Describe your request'] },
    { heading: 'Contact the alumni office', controls: ['Submit request', 'My requests'] }
  ],
  statusGuide: [
    { heading: 'NDDU Alumni', controls: ['Account · your name'] },
    { heading: 'Account menu', controls: ['My alumni account', 'Profile settings', 'Help & support', 'Sign out'] },
    { heading: 'My requests', controls: ['Submitted', 'Being reviewed', 'Needs information', 'Completed'] },
    { heading: 'My requests', controls: ['Request subject · Needs information', 'View conversation'] },
    { heading: 'Request conversation', controls: ['Conversation', 'Your reply', 'Send reply'] },
    { heading: 'My requests', controls: ['Check for updates'] }
  ],
  privacy: [
    { heading: 'NDDU Alumni', controls: ['Account · your name'] },
    { heading: 'Account menu', controls: ['My alumni account', 'Profile settings', 'Help & support', 'Sign out'] },
    { heading: 'Help & support', controls: ['Contact alumni office', 'Your request is private to you and authorized administrators. Please leave out passwords, payment details and identity documents.'] },
    { heading: 'Contact the alumni office', controls: ['Subject', 'Describe your request'] },
    { heading: 'My requests', controls: ['View conversation', 'Your reply'] }
  ],
  portalNavigation: [
    { heading: 'NDDU Alumni', controls: ['Menu', 'Account', 'Green chat button'] },
    { heading: 'Site menu', controls: ['Home', 'About NDDU', 'Community', 'Directory', 'Opportunities', 'Events', 'Gallery'] },
    { heading: 'Alumni portal', controls: ['Green chat button', 'Chats'] },
    { heading: 'Account menu', controls: ['My alumni account', 'Help & support', 'Sign out'] },
    { heading: 'Help & support', controls: ['Contact alumni office'] }
  ],
  helpCenter: [
    { heading: 'NDDU Alumni', controls: ['Account · your name'] },
    { heading: 'Account menu', controls: ['My alumni account', 'Profile settings', 'Help & support', 'Sign out'] },
    { heading: 'Help & support', controls: ['Account & profile · Get help', 'Alumni records · Get help', 'Documents & requests · Get help', 'Using the alumni portal · Get help'] },
    { heading: 'Help & support', controls: ['Frequently asked questions', 'Search help: profile, documents, group chat...'] },
    { heading: 'Still need help?', controls: ['Contact alumni office', 'My requests'] }
  ]
};

function getWalkthrough(question) {
  const q = question.toLowerCase();
  if (/profile picture|profile photo|profile pic|avatar|\b(change|update|upload|add|replace)\b.{0,12}\b(picture|photo|pic|avatar)\b/.test(q)) return 'profilePicture';
  if (/profile|change my name|email|photo|personal details/.test(q)) return 'editProfile';
  if (/block/.test(q)) return 'blockMember';
  if (/inappropriate|harass|report.{0,20}(message|person)|safety/.test(q)) return 'portalIssue';
  if (/leave.{0,20}(batch|group)|quit.{0,20}(batch|group)/.test(q)) return 'leaveBatch';
  if (/join.{0,30}(batch|group)|batch.{0,30}(join|group)|find.{0,20}batch/.test(q)) return 'joinBatch';
  if (/submit.{0,20}request|send.{0,20}request|contact.{0,20}(office|alumni)|new support request/.test(q)) return 'submitRequest';
  if (/status|being reviewed|completed|needs information/.test(q)) return 'statusGuide';
  if (/check.{0,20}request|request.{0,20}(reply|status|update)|see.{0,20}repl|reply.{0,20}request|add.{0,20}(detail|information)|after.{0,12}submit|follow up/.test(q)) return 'checkRequest';
  if (/why|cannot|can.t|unable|trouble|not working/.test(q) && /chat|message|conversation/.test(q)) return 'chatHelp';
  if (/send.{0,20}message|direct message|message.{0,20}(alumn|person)|start.{0,20}conversation/.test(q)) return 'sendMessage';
  if (/chat|messag|conversation/.test(q)) return 'chatHelp';
  if (/password|sign in|log in|forgot/.test(q)) return 'passwordReset';
  if (/create.{0,20}account|register|sign up/.test(q)) return 'register';
  if (/verif|pending|rejected|approval/.test(q)) return 'verification';
  if (/document|certificate|transcript/.test(q)) return 'documents';
  if (/private|who can read|privacy/.test(q)) return 'privacy';
  if (/phone|mobile/.test(q)) return 'portalNavigation';
  if (/portal|error|loading|problem|report/.test(q)) return 'portalIssue';
  if (/batch|group/.test(q)) return 'joinBatch';
  if (/request|reply|office/.test(q)) return 'submitRequest';
  return 'helpCenter';
}

function ProfilePictureWalkthrough({ type = 'profilePicture', batchGroups = [], allBatchGroups = [], peopleCount = 0, profile, userEmail = '' }) {
  const guide = helpWalkthroughs[type] || helpWalkthroughs.profilePicture;
  const [step, setStep] = useState(0);
  const current = guide.steps[step];
  const screen = walkthroughScreens[type]?.[step] || { heading: guide.name, controls: [current.target] };
  const targetText = current.target.toLowerCase();
  const foundIndex = screen.controls.findIndex(control => control.toLowerCase().includes(targetText) || targetText.includes(control.toLowerCase()));
  const activeIndex = foundIndex < 0 ? 0 : foundIndex;
  const fieldNames = new Set(['email','password','confirm password','first name','last name','department / college','course / program','degree','graduation year','batch name','name used while studying','graduation date','course or program','subject','describe your request','aa','your reply','search alumni or batch','find a batch','search help: profile, documents, group chat...']);
  const sectionNames = new Set(['account information','education information','password requirements','how will you use alumniconnect?','my requests','conversation','your membership','community rules','announcements','members','about & rules','your batch chats','direct messages']);
  const actionNames = /^(edit profile|choose picture|create an account|create alumni account|log in|forgot password\?|send reset link|verify alumni status|submit for verification|join batch|leave batch|open group chat|submit request|view conversation|check for updates|get help|contact alumni office|send|cancel|ok|profile|browse batch groups.*|green chat button)$/i;
  return <section className="help-walkthrough" aria-label={`Visual guide: ${guide.name}`}>
    <small className="help-walkthrough-note">Follow these labels on your screen. Names or results may vary.</small>
    <div className="help-walkthrough-scene" aria-live="polite">
      {type === 'joinBatch' ? <BatchGuidePreview step={step} joinedGroups={batchGroups} allGroups={allBatchGroups} activeIndex={activeIndex} registeredAccounts={peopleCount} /> : type === 'leaveBatch' ? <LeaveBatchPreview step={step} joinedGroups={batchGroups} activeIndex={activeIndex} /> : type === 'profilePicture' || type === 'editProfile' ? <ProfileGuidePreview step={step} activeIndex={activeIndex} editDetails={type === 'editProfile'} profile={profile} userEmail={userEmail} /> : ['submitRequest','checkRequest','documents','portalIssue','statusGuide','privacy','helpCenter'].includes(type) ? <SupportGuidePreview type={type} step={step} screen={screen} target={current.target} activeIndex={activeIndex} /> : ['register','passwordReset','verification'].includes(type) ? <AuthGuidePreview type={type} step={step} screen={screen} activeIndex={activeIndex} /> : ['sendMessage','chatHelp','blockMember'].includes(type) ? <ChatGuidePreview type={type} step={step} screen={screen} activeIndex={activeIndex} /> : type === 'portalNavigation' ? <NavigationGuidePreview step={step} activeIndex={activeIndex} /> : <div className="help-demo-phone"><div className="help-demo-top"><span>NDDU ALUMNI</span><span aria-hidden="true">⋮</span></div><div className="help-demo-screen"><strong>{screen.heading}</strong><div className="help-demo-controls">{screen.controls.map((control,index)=>{const normalized=control.toLowerCase();const highlighted=index===activeIndex;const field=fieldNames.has(normalized)||normalized.startsWith('search ');const section=sectionNames.has(normalized);const action=actionNames.test(control);return <span key={`${control}-${index}`} className={`help-demo-control ${field?'is-field':''} ${section?'is-section':''} ${action?'is-action':''} ${highlighted?'is-highlighted':''}`}>{control}{field&&<i aria-hidden="true"/>}</span>})}</div><span className="help-demo-pointer" aria-hidden="true">👆</span></div></div>}
    </div>
    <strong className="help-walkthrough-title">{current.title}</strong><p>{current.text}</p>
    <div className="help-walkthrough-controls"><button type="button" onClick={()=>setStep(value=>Math.max(0,value-1))} disabled={step===0}>Previous</button><span>Step {step+1} of {guide.steps.length}</span><button type="button" onClick={()=>setStep(value=>Math.min(guide.steps.length-1,value+1))} disabled={step===guide.steps.length-1}>Next</button></div>
  </section>;
}

function BatchGuidePreview({ step, joinedGroups, allGroups, activeIndex, registeredAccounts }) {
  const joined = joinedGroups[0];
  const result = allGroups.find(group => !group.joined) || allGroups[0];
  const label = joined?.name || 'Your batch name';
  const year = joined?.batch_year || result?.batch_year;
  const members = joined?.member_count ?? result?.member_count;
  const hit = index => activeIndex === index ? 'is-highlighted' : '';
  const groupRow = <div className={`actual-chat-batch-row ${hit(2)}`}><span className="actual-chat-avatar">{joined?.photo_url ? <img src={joined.photo_url} alt="" /> : year || 'B'}</span><span><strong>{label}</strong><small>{members ?? '—'} batch members</small></span></div>;
  if (step === 0) return <div className="actual-site-preview"><header><strong>NDDU <b>ALUMNI</b></strong><span>Menu</span></header><div className="actual-site-hero"><small>ALUMNI COMMUNITY</small><strong>Connect with your alumni community</strong></div><span className={`actual-chat-fab ${hit(0)}`} aria-label="Green chat button">💬</span></div>;
  if (step === 1 || step === 7) return <div className="actual-chat-preview"><header><strong>Chats</strong><small>{registeredAccounts} registered accounts</small><span aria-hidden="true">×</span></header><div className="actual-chat-search">⌕ &nbsp;Search alumni or batch</div><div className="actual-chat-content"><strong className="actual-chat-section">Your batch chats</strong>{joined ? <div className={`actual-chat-batch-row ${hit(step === 1 ? 2 : 1)}`}><span className="actual-chat-avatar">{year || 'B'}</span><span><strong>{label}</strong><small>{members ?? '—'} batch members</small></span></div> : <div className="actual-chat-empty">Join your batch under Alumni groups to access its chat.</div>}<strong className="actual-chat-section">Help assistant</strong><div className="actual-chat-bot">✦ &nbsp; AI help assistant</div><strong className="actual-chat-section">Direct messages</strong></div></div>;
  if (step === 2) return <div className="actual-nav-preview"><strong>Your alumni community</strong>{['Home','About NDDU','Community','Directory','Opportunities','Events','Gallery'].map((item,index)=><span className={item === 'Directory' ? hit(3) : ''} key={item}>{item}<small>{item==='Directory'?'Find alumni and batch groups':''}</small></span>)}</div>;
  if (step === 3) return <div className="actual-directory-preview"><small>Alumni community</small><h3>Alumni directory</h3><p>Find verified members without exposing private contact information.</p><div><strong>Looking for your batch?</strong><p>Find your batch community, members, and group chat.</p><button className={hit(2)}>Browse batch groups →</button></div></div>;
  if (step === 4 || step === 5) return <div className="actual-batch-preview"><div className="actual-batch-hero"><small>NDDU ALUMNI COMMUNITY</small><strong>Alumni batch groups</strong><p>Find your batch community. Read batch announcements, find classmates, and open your group conversation in Chats.</p></div>{step === 4 && <label className={hit(0)}>Find a batch<input placeholder="Batch name, year, or president" readOnly /></label>}<div className={`actual-batch-card ${step === 5 ? hit(1) : ''}`}><span className="actual-batch-photo">{result?.photo_url ? <img src={result.photo_url} alt="" /> : result?.batch_year || 'B'}</span><strong>{result?.name || 'Batch group name'}</strong><small>{result?.batch_year ? `Class of ${result.batch_year}` : 'Batch year not set'}</small><small>President: {result?.president_name || 'Not assigned yet'}</small><small>{result?.member_count ?? '—'} members{result?.joined ? ' · Joined' : ''}</small><button>View batch →</button></div><small className="actual-batch-vary">Group cards change with the search results.</small></div>;
  return <div className="actual-batch-preview"><div className="actual-batch-hero"><small>NDDU ALUMNI COMMUNITY</small><strong>{result?.name || 'Your batch name'}</strong><p>Your batch’s place to reconnect, share updates, and help each other.</p></div><div className="actual-batch-overview"><span className="actual-batch-photo">{result?.photo_url ? <img src={result.photo_url} alt="" /> : result?.batch_year || 'B'}</span><div><strong>{result?.name || 'Your batch name'}</strong><p>{result?.batch_year ? `Class of ${result.batch_year} · ` : ''}{result?.member_count ?? '—'} members</p><p>Batch president: {result?.president_name || 'Not assigned yet'}</p></div><button className={hit(3)}>Join batch</button></div></div>;
}

function LeaveBatchPreview({ step, joinedGroups, activeIndex }) {
  const group = joinedGroups[0];
  const name = group?.name || 'Your batch name';
  const year = group?.batch_year;
  const mark = index => activeIndex === index ? 'is-highlighted' : '';
  if (step === 0) return <div className="actual-nav-preview"><strong>Your alumni community</strong>{['Home','About NDDU','Community','Directory','Opportunities','Events','Gallery'].map((label,index)=><span className={label === 'Directory' ? mark(0) : ''} key={label}>{label}<small>{label==='Directory'?'Find alumni and batch groups':''}</small></span>)}</div>;
  if (step === 1) return <div className="actual-directory-preview"><small>Alumni community</small><h3>Alumni directory</h3><p>Find verified members without exposing private contact information.</p><div><strong>Looking for your batch?</strong><p>Find your batch community, members, and group chat.</p><button className={mark(1)}>Browse batch groups →</button></div></div>;
  if (step === 2) return <div className="actual-batch-preview"><div className="actual-batch-hero"><small>NDDU ALUMNI COMMUNITY</small><strong>Alumni batch groups</strong></div><label>Find a batch<input placeholder="Batch name, year, or president" readOnly /></label><div className={`actual-batch-card ${mark(1)}`}><span className="actual-batch-photo">{group?.photo_url ? <img src={group.photo_url} alt="" /> : year || 'B'}</span><strong>{name}</strong><small>{year ? `Class of ${year}` : 'Batch year not set'}</small><small>{group?.member_count ?? '—'} members · Joined</small><button>View batch →</button></div></div>;
  if (step === 3) return <div className="actual-batch-preview"><div className="actual-batch-hero"><small>NDDU ALUMNI COMMUNITY</small><strong>{name}</strong></div><div className="actual-batch-tabs"><span>Announcements</span><span>Members</span><span className={mark(2)}>About &amp; rules</span></div><div className="actual-batch-overview"><strong>{name}</strong><small>Class of {year || 'your year'} · {group?.member_count ?? '—'} members</small></div></div>;
  if (step === 4) return <div className="actual-batch-preview"><div className="actual-batch-hero"><small>NDDU ALUMNI COMMUNITY</small><strong>About this batch</strong></div><div className="actual-batch-membership"><strong>Your membership</strong><p>Leaving removes your access to this batch and its chat.</p><button className={mark(3)}>Leave batch</button></div></div>;
  return <div className="actual-auth-preview"><h4>Browser confirmation</h4><p>Leave this batch? You will also lose access to its group chat.</p><button>Cancel</button><button className={mark(2)}>OK</button></div>;
}

function ProfileGuidePreview({ step, activeIndex, editDetails, profile = {}, userEmail = '' }) {
  profile = profile || {};
  const hit = index => activeIndex === index ? 'is-highlighted' : '';
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Your name';
  const initials = [profile.first_name?.[0], profile.last_name?.[0]].filter(Boolean).join('').toUpperCase() || 'YOU';
  const avatar = <span className="actual-person-photo">{profile.avatar_url ? <img src={profile.avatar_url} alt="Your current profile picture" /> : initials}</span>;
  if (step === 0) return <div className="actual-profile-preview"><div className="actual-account-menu"><div className="actual-account-id">{avatar}<div><strong>{name}</strong><small>{userEmail || 'Your email address'}</small></div></div><div className={`actual-profile-row ${hit(0)}`}>{avatar}<strong>My alumni account</strong><small>{name} · {userEmail || 'Your email address'}</small></div><div>Profile settings</div><div>Verify alumni status</div></div></div>;
  if (step === 1) return <div className="actual-profile-preview"><div className="actual-profile-cover"><div className="actual-profile-identity">{avatar}<div><small>Verified alumni profile</small><strong>{name}</strong><em>{profile.graduation_year ? `Class of ${profile.graduation_year}` : 'Alumni member'}</em></div><button className={hit(3)}>Edit profile</button></div></div><div className="actual-profile-tabs">Posts　 About　 Friends　 Photos</div><div className="actual-profile-body"><strong>Intro</strong><span>Degree　 Course　 Department</span><button>Edit details</button></div></div>;
  if (step === 2 && !editDetails) return <div className="actual-profile-preview"><div className="actual-editor-title"><strong>Edit alumni profile</strong><span>×</span></div><div className="actual-cover-editor">Cover photo <span>Choose cover</span></div><div className="actual-picture-editor">{avatar}<div><strong>Profile picture</strong><small>JPG, PNG, or WebP · maximum 2 MB</small><button className={hit(2)}>Choose File　No file chosen</button></div></div></div>;
  return <div className="actual-profile-preview"><div className="actual-editor-title"><strong>Edit alumni profile</strong></div><div className="actual-profile-fields"><label className={hit(0)}>First name<input value="Jane" readOnly /></label><label>Last name<input value="Doe" readOnly /></label><label>Degree<input readOnly /></label><label>Course / program<input readOnly /></label></div><footer><button>Cancel</button><button className={hit(editDetails ? 1 : 4)}>Save changes</button></footer></div>;
}

function SupportGuidePreview({ type, step, screen, target, activeIndex }) {
  const hit = index => activeIndex === index ? 'is-highlighted' : '';
  if (step === 0) return <div className="actual-support-preview"><header><strong>NDDU <b>ALUMNI</b></strong><span className={hit(0)}>Account　◉</span></header><div className="actual-support-page-head"><small>NDDU ALUMNI HELP CENTER</small><strong>How can we help you?</strong><span>Find an answer, get help from the alumni office, or follow up on a request.</span></div></div>;
  if (step === 1) return <div className="actual-support-preview"><div className="actual-support-menu"><strong>Account</strong><span>My alumni account</span><span>Profile settings</span><span className={hit(2)}>Help &amp; support</span><span>Sign out</span></div></div>;
  if (screen.heading === 'My requests' && type === 'statusGuide' && step === 2) return <div className="actual-support-preview"><h4 className="is-highlighted">My requests</h4><div className="actual-status-list"><span>Submitted</span><span>Being reviewed</span><span>Needs information</span><span>Completed</span></div><div className="actual-request-card"><small>GENERAL ASSISTANCE · NEEDS INFORMATION</small><strong>Your request subject</strong><button>View conversation</button></div></div>;
  if (screen.heading === 'My requests') return <div className="actual-support-preview"><h4 className={target === 'My requests' ? 'is-highlighted' : ''}>My requests</h4><div className="actual-request-card"><small>GENERAL ASSISTANCE · NEEDS INFORMATION</small><strong>Example request subject</strong><p>The alumni office’s reply appears inside this request.</p><button className={target === 'View conversation' ? 'is-highlighted' : ''}>View conversation</button><button className={target === 'Check for updates' ? 'is-highlighted' : ''}>Check for updates</button></div></div>;
  if (screen.heading === 'Request conversation') return <div className="actual-support-preview"><h4>Request conversation</h4><div className="actual-request-card"><small>Example request subject</small><div className="actual-reply-bubble">Alumni office reply appears here.</div><label className={target === 'Your reply' ? 'is-highlighted' : ''}>Your reply<textarea readOnly placeholder="Add more details" /></label><button className={target === 'Send reply' ? 'is-highlighted' : ''}>Send reply</button></div></div>;
  if (screen.heading === 'Contact the alumni office') return <div className="actual-support-preview"><h4>Contact the alumni office</h4><p>Tell us what you need help with. You can track this conversation in My requests after sending.</p><div className="actual-support-form"><label>Topic<select><option>General assistance</option><option>Record correction</option><option>Document inquiry</option></select></label><label>Subject<input readOnly placeholder="Briefly describe what you need help with" className={hit(1)} /></label><label>Describe your request<textarea readOnly placeholder="Describe your question or problem and any steps you have already tried." className={hit(2)} /></label><button className={hit(0)}>Submit request</button></div></div>;
  if (screen.heading === 'Help & support' && type === 'helpCenter' && step === 3) return <div className="actual-support-preview"><div className="actual-support-page-head"><small>NDDU ALUMNI HELP CENTER</small><strong>How can we help you?</strong><span>Find an answer, get help from the alumni office, or follow up on a request.</span></div><div className="actual-faq-preview"><strong className={hit(0)}>Frequently asked questions　⌄</strong><div>How do I update my profile?　＋</div><div>How do I join my batch group?　＋</div></div></div>;
  if (screen.heading === 'Help & support') return <div className="actual-support-preview"><div className="actual-support-page-head"><small>NDDU ALUMNI HELP CENTER</small><strong>How can we help you?</strong><span>Choose a topic to contact the alumni office.</span></div><div className="actual-support-topic-grid">{['Account & profile','Alumni records','Documents & requests','Using the alumni portal'].map((topic,index)=><div className={hit(index)} key={topic}><b>{topic}</b><small>{topic==='Alumni records'?'Ask about incorrect names, batch details or other alumni records.':'Get help from the alumni office.'}</small><strong>Get help　→</strong></div>)}</div></div>;
  if (screen.heading === 'Still need help?') return <div className="actual-support-preview"><aside className="actual-support-contact"><span>♙</span><h4>Still need help?</h4><p>Send a private request to the alumni office. You can read replies and add more details in My requests.</p><button className={hit(0)}>Contact alumni office</button></aside></div>;
  if (step >= 4) return <div className="actual-support-preview"><h4>My requests</h4><div className="actual-request-card"><strong>Request sent</strong><small>SUBMITTED</small><p>Follow replies and updates here.</p><button className={hit(0)}>Check for updates</button></div></div>;
  return <div className="actual-support-preview"><h4>{screen.heading}</h4><div className="actual-support-topic-grid">{screen.controls.map((control,index)=><div className={hit(index)} key={control}><b>{control.split(' · ')[0]}</b><strong>Get help　→</strong></div>)}</div></div>;
}

function AuthGuidePreview({ type, step, screen, activeIndex }) {
  const mark = index => activeIndex === index ? 'is-highlighted' : '';
  const field = (label,index,placeholder='') => <label className={mark(index)} key={label}>{label}<input readOnly placeholder={placeholder} /></label>;
  if (type === 'register') {
    if (step === 0) return <div className="actual-auth-preview"><h4>Welcome back</h4><p>Log in to reconnect with the NDDU alumni community.</p>{field('Email',0)}{field('Password',1)}<button>Log in</button><span>Forgot password?</span><p>New to NDDU Alumni? <b className={mark(4)}>Create an account</b></p></div>;
    if (step === 1) return <div className="actual-auth-preview"><h4>Create your account</h4><strong>Account Information</strong>{field('First Name',1)}{field('Last Name',2)}{field('Email',3)}</div>;
    if (step === 2) return <div className="actual-auth-preview"><h4>Create your account</h4>{field('Password',0)}{field('Confirm Password',1)}<section className={`actual-auth-requirements ${mark(2)}`}><strong>Password requirements</strong><span>At least 12 characters</span><span>One uppercase letter</span><span>One lowercase letter</span><span>One number</span></section></div>;
    if (step === 3) return <div className="actual-auth-preview"><h4>Create your account</h4><section><strong>How will you use AlumniConnect?</strong><p><b>☑ Alumni</b>　□ Employer / Recruiter</p><small>Connect with classmates, join events, and share updates.</small></section><strong className={mark(3)}>Education Information</strong>{field('Department / College',4,'Select your college')}{field('Course / Program',5,'Select a college first')}{field('Degree',6,'Filled automatically from your course')}{field('Graduation Year',7,'Select graduation year')}{field('Batch Name (optional)',8,'Enter your batch name (if known)')}</div>;
    return <div className="actual-auth-preview"><h4>Create your account</h4><div className={`actual-auth-consent ${mark(0)}`}>□ I agree to the Terms of Service and acknowledge the Privacy Policy.</div><div className="actual-auth-captcha">Protected by Cloudflare Turnstile</div><button className={mark(2)}>Create Alumni Account</button><p>Already have an account? Log in</p></div>;
  }
  if (type === 'verification') {
    if (step === 0) return <div className="actual-profile-preview"><div className="actual-account-menu"><strong>Account</strong><div>My alumni account</div><div>Alumni not verified</div><div className={`actual-profile-row ${mark(2)}`}>Verify alumni status</div></div></div>;
    if (step === 1) return <div className="actual-auth-preview"><h4>Alumni verification</h4>{field('Name used while studying',0)}{field('Graduation date (DD/MM/YYYY)',1)}{field('Batch name',2)}{field('Course or program',3)}</div>;
    if (step === 2) return <div className="actual-auth-preview"><h4>Alumni verification</h4><strong>Graduation evidence</strong><p>Degree certificate, transcript, or official alumni record</p><small>PDF, JPG, or PNG · maximum 10 MB</small><button className={mark(1)}>Choose file</button></div>;
    return <div className="actual-auth-preview"><h4>Alumni verification</h4><button className={mark(0)}>Submit for verification</button><p className="actual-auth-status">Under review</p></div>;
  }
  if (step <= 1) return <div className="actual-auth-preview"><h4>Welcome back</h4><p>Log in to reconnect with the NDDU alumni community.</p>{field('Email',0)}{field('Password',1)}<button className={step === 0 ? mark(2) : ''}>Log in</button><div className={`actual-auth-link ${step === 1 ? mark(0) : ''}`}>Forgot password?</div><p>New to NDDU Alumni? Create an account</p></div>;
  if (step === 2 || step === 3) return <div className="actual-auth-preview"><h4>Reset your password</h4><p>We will email a secure password-reset link to your account.</p>{field('Email',step === 2 ? 0 : -1)}<div className="actual-auth-captcha">Protected by Cloudflare Turnstile</div><button className={step === 3 ? mark(1) : ''}>Send reset link</button><div>Back to login</div></div>;
  return <div className="actual-auth-preview"><h4>Outside the portal: your email app</h4><div className="actual-auth-field">Check the email inbox for your account</div><small>If the email is missing, check spam.</small></div>;
}

function ChatGuidePreview({ type, step, screen, activeIndex }) {
  const mark = index => activeIndex === index ? 'is-highlighted' : '';
  const row = (label, className = '') => <div className={`actual-chat-batch-row ${className}`}><span className="actual-chat-avatar">A</span><span><strong>{label}</strong><small>Tap to continue chatting</small></span></div>;
  if (screen.heading === 'Help & support') return <div className="actual-support-preview"><div className={`actual-support-page-head ${mark(0)}`}><small>NDDU ALUMNI HELP CENTER</small><strong>How can we help you?</strong><span>Choose a topic to contact the alumni office.</span></div><div className="actual-support-topic-grid"><div><b>Using the alumni portal</b><strong>Get help →</strong></div><div><b>Still need help?</b><strong>Contact alumni office</strong></div></div></div>;
  if (type === 'blockMember' && step === 2) return <div className="actual-chat-preview"><header><strong>Conversation options</strong></header><div className="actual-chat-option-list"><span>Shared in this chat</span><span>Personalize</span><strong className={mark(2)}>Block alumnus</strong><small>Stop messages from this person</small></div></div>;
  if (type === 'blockMember' && step === 3) return <div className="actual-auth-preview"><h4>Browser confirmation</h4><p>Block this alumnus?</p><button>Cancel</button><button className={mark(2)}>OK</button></div>;
  if (type === 'blockMember' && step === 1 || (type !== 'blockMember' && screen.heading === 'Alumni member')) return <div className="actual-chat-preview"><header><strong>Alumni member</strong><span className={type === 'blockMember' ? mark(1) : ''}>⋮</span></header><div className="actual-chat-log"><div className="actual-chat-bubble">Hello. How can I help?</div></div><footer><div className={`actual-chat-input ${type === 'sendMessage' ? mark(activeIndex) : ''}`}>Aa</div><button className={type === 'sendMessage' ? mark(activeIndex) : ''}>Send</button></footer></div>;
  return <div className="actual-chat-preview"><header><strong className={type === 'sendMessage' && step === 0 || type === 'chatHelp' && step === 0 ? mark(0) : ''}>Chats</strong><small>registered accounts</small><span>×</span></header><div className={`actual-chat-search ${step === 1 ? mark(0) : ''}`}>⌕ &nbsp;Search alumni or batch</div><div className="actual-chat-content"><strong className="actual-chat-section">Your batch chats</strong><div className="actual-chat-empty">Joined batch groups appear here.</div><strong className={`actual-chat-section ${type === 'chatHelp' && step === 2 || type === 'blockMember' && step === 0 ? mark(activeIndex) : ''}`}>{type === 'chatHelp' ? 'Your batch chats · Direct messages' : 'Direct messages'}</strong>{row('Alumni member',type === 'sendMessage' && step === 2 ? mark(activeIndex) : '')}</div></div>;
}

function NavigationGuidePreview({ step, activeIndex }) {
  const mark = index => activeIndex === index ? 'is-highlighted' : '';
  if (step === 0) return <div className="actual-site-preview"><header><strong>NDDU <b>ALUMNI</b></strong><span className={mark(0)}>☰ Menu</span></header><div className="actual-site-hero"><small>ALUMNI COMMUNITY</small><strong>Connect with your alumni community</strong></div></div>;
  if (step === 1) return <div className="actual-nav-preview"><strong>Your alumni community</strong>{['Home','About NDDU','Community','Directory','Opportunities','Events','Gallery'].map((label,index)=><span className={mark(index)} key={label}>{label}<small>{label==='Directory'?'Find alumni and batch groups':''}</small></span>)}</div>;
  if (step === 2) return <div className="actual-site-preview"><header><strong>NDDU <b>ALUMNI</b></strong><span>Menu</span></header><div className="actual-site-hero"><small>ALUMNI COMMUNITY</small><strong>Find alumni and batch groups</strong></div><span className={`actual-chat-fab ${mark(0)}`}>💬</span></div>;
  if (step === 3) return <div className="actual-profile-preview"><div className="actual-account-menu"><strong>Account</strong><div>My alumni account</div><div>Profile settings</div><div className={mark(1)}>Help &amp; support</div><div>Sign out</div></div></div>;
  return <div className="actual-support-preview"><div className="actual-support-page-head"><small>NDDU ALUMNI HELP CENTER</small><strong>How can we help you?</strong><span>Choose a topic to contact the alumni office.</span></div><div className="actual-support-topic-grid"><div className={mark(0)}><b>Using the alumni portal</b><strong>Get help →</strong></div></div></div>;
}

export default function Chat({ user, profile, contact, onContactHandled, batchContact, onBatchHandled }) {
  const [batchGroups, setBatchGroups] = useState([]);
  const [allBatchGroups, setAllBatchGroups] = useState([]);
  const [directReply,setDirectReply]=useState(null);
  const [directReactions,setDirectReactions]=useState([]);
  const [actionBusy,setActionBusy]=useState(false);
  const directInputRef=useRef(null);
  const activePersonRef=useRef(null);
  const realtimeReady=useRef(false);
  const messageRequests=useRef(createAsyncCache({ttlMs:0,maxEntries:2}));
  const peopleRequests=useRef(createAsyncCache({ttlMs:1000,maxEntries:1}));
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [batchSettings]=useChatSettings(selectedBatch?`batch:${selectedBatch.id}`:'');
  const [batchMenuTarget,setBatchMenuTarget]=useState(null);
  const [batchMinimized,setBatchMinimized] = useState(false);
  useEffect(()=>{setBatchMinimized(false);},[selectedBatch]);
  const [batchError, setBatchError] = useState('');
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpDraft, setHelpDraft] = useState('');
  const [helpHistory, setHelpHistory] = useState(() => restoreHelpHistory(user.id));
  const helpMessages = helpHistory.messages;
  const helpMessagesRef = useRef(null);
  function addHelpMessages(makeMessages) {
    setHelpHistory(current => ({ messages: makeMessages(current.messages), lastActivity: Date.now() }));
  }
  useEffect(() => {
    const key = helpHistoryKey(user.id);
    try { localStorage.setItem(key, JSON.stringify(helpHistory)); } catch { /* Keep the transcript in memory if local storage is unavailable. */ }
    const remaining = Math.max(0, HELP_HISTORY_TTL - (Date.now() - helpHistory.lastActivity));
    const expiry = setTimeout(() => {
      try { localStorage.removeItem(key); } catch { /* Ignore unavailable storage. */ }
      setHelpHistory({ messages: [welcomeHelpMessage()], lastActivity: Date.now() });
    }, remaining);
    return () => clearTimeout(expiry);
  }, [user.id, helpHistory]);
  useEffect(() => {
    if (!helpOpen) return;
    const frame = requestAnimationFrame(() => {
      const log = helpMessagesRef.current;
      if (log) log.scrollTop = log.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [helpOpen, helpHistory.messages]);
  const [minimized, setMinimized] = useState(false);
  const [people, setPeople] = useState([]);
  const [selected, setSelected] = useState(null);
  const chatKey=selected?`direct:${[user.id,selected.id].sort().join(':')}`:'';
  const [settings,setSettings]=useChatSettings(chatKey);
  const [messages, setMessages] = useState([]);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef(null);
  const followDirectRef=useRef(true);
  const fileRef = useRef(null);
  useEffect(() => {
    let active = true;
    async function loadBatches() {
      const { data, error } = await supabase.rpc('list_batch_groups');
      if (!active) return;
      if (error) { setBatchError('Batch chats could not be loaded. Open Alumni groups to check access.'); return; }
      setAllBatchGroups(data || []);
      const joined = (data || []).filter(group => group.joined);
      setBatchGroups(joined); setBatchError('');
      setSelectedBatch(current => current && joined.some(group => group.id === current.id) ? current : null);
    }
    loadBatches();
    window.addEventListener('batch-membership-changed', loadBatches);
    return () => { active = false; window.removeEventListener('batch-membership-changed', loadBatches); };
  }, [user.id, directoryOpen]);
  useEffect(() => {
    if (batchContact?.id) { setSelected(null); setSelectedBatch(batchContact); setDirectoryOpen(false); onBatchHandled?.(); }
  }, [batchContact?.id]);

  async function loadPeople() {
    return peopleRequests.current.get(user.id, async () => {
    const { data, error: loadError } = await supabase.rpc('list_chat_profiles');
    if (loadError) setError('Apply the latest Supabase schema to enable chat.');
    else setPeople((data || []).filter((p) => p.id !== user.id));
    });
  }

  async function loadMessages(personId) {
    return messageRequests.current.get(personId, async () => {
    const { data, error: loadError } = await supabase.from('direct_messages').select('*')
      .or(`and(sender_id.eq.${user.id},recipient_id.eq.${personId}),and(sender_id.eq.${personId},recipient_id.eq.${user.id})`)
      .order('created_at', { ascending: false }).limit(100);
    if(activePersonRef.current!==personId)return;
    if (loadError) setError('Messages could not be loaded.'); else {
      const resolved = await Promise.all((data || []).map(async (message) => {
        if (!message.attachment_url || message.message_type === 'gif' || message.attachment_url.startsWith('http')) return message;
        try { return { ...message, attachment_url: await mediaUrl(message.attachment_url) }; }
        catch { return { ...message, attachment_url: '' }; }
      }));
      if(activePersonRef.current!==personId)return;
      const log=endRef.current?.parentElement;
      followDirectRef.current=!log||log.scrollHeight-log.scrollTop-log.clientHeight<80;
      setMessages(resolved.reverse());
      if(data?.length){const result=await supabase.from('direct_message_reactions').select('*').in('message_id',data.map(m=>m.id));if(activePersonRef.current===personId)setDirectReactions((result.data||[]).map(r=>({...r,isMine:r.user_id===user.id})));}
      else setDirectReactions([]);
    }
    const unreadIds = (data || []).filter(message => message.recipient_id === user.id && !message.read_at).map(message => message.id);
    if (!loadError && activePersonRef.current === personId && unreadIds.length) {
      await supabase.from('direct_messages').update({ read_at: new Date().toISOString() })
        .in('id', unreadIds).eq('recipient_id', user.id).is('read_at', null);
    }
    });
  }

  useEffect(() => { loadPeople(); }, [user.id]);
  useEffect(() => { if (contact?.id) { setSelectedBatch(null); setSelected(contact); setDirectoryOpen(true); setMinimized(false); onContactHandled?.(); } }, [contact?.id]);
  useEffect(() => { activePersonRef.current=selected?.id;setMessages([]);setDirectReply(null);setDirectReactions([]);setError('');if(selected?.id)loadMessages(selected.id);let lastPoll=Date.now();const poll=()=>{if(selected?.id&&!document.hidden&&(!realtimeReady.current||Date.now()-lastPoll>=15000)){lastPoll=Date.now();loadMessages(selected.id);}};const onVisible=()=>{lastPoll=0;poll();};const timer=setInterval(poll,5000);document.addEventListener('visibilitychange',onVisible);return()=>{activePersonRef.current=null;clearInterval(timer);document.removeEventListener('visibilitychange',onVisible);}; }, [selected?.id]);
  useEffect(() => {
    let refreshTimer;
    const refresh = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => { if (!document.hidden) { loadPeople(); if (selected?.id) loadMessages(selected.id); } }, 200);
    };
    const channel = supabase.channel(`chat-widget:${user.id}`).on('postgres_changes',
      { event: '*', schema: 'public', table: 'direct_messages',filter:`sender_id=eq.${user.id}` }, refresh).on('postgres_changes',{event:'*',schema:'public',table:'direct_messages',filter:`recipient_id=eq.${user.id}`}, refresh).subscribe(status => { realtimeReady.current = status === 'SUBSCRIBED'; });
    return () => { clearTimeout(refreshTimer); realtimeReady.current=false; supabase.removeChannel(channel); };
  }, [user.id, selected?.id]);
  useEffect(() => { if(followDirectRef.current){const log=endRef.current?.parentElement;if(log)log.scrollTop=log.scrollHeight;} }, [messages, minimized]);


  const unread = people.reduce((sum, p) => sum + Number(p.unread_count || 0), 0);
  const filtered = useMemo(() => people.filter((p) => nameOf(p).toLowerCase().includes(search.toLowerCase())), [people, search]);

  async function insertMessage(payload) {
    if (!selected || sending) return false;
    const recipientId=selected.id;
    const replyId=directReply?.id;
    setSending(true); setError('');
    try {
      if(replyId){
        const {data:original,error:originalError}=await supabase.from('direct_messages').select('id,sender_id,recipient_id,unsent_at').eq('id',replyId).maybeSingle();
        if(originalError)throw originalError;
        if(!original||original.unsent_at)throw new Error('The original message was removed or unsent. Cancel the reply to send your draft as a new message.');
        if(!((original.sender_id===user.id&&original.recipient_id===recipientId)||(original.sender_id===recipientId&&original.recipient_id===user.id)))throw new Error('This reply belongs to another conversation. Cancel the reply and select a message in this chat.');
      }
      const {error:sendError}=await supabase.from('direct_messages').insert({sender_id:user.id,recipient_id:recipientId,body:payload.body||'',...payload,...(replyId?{reply_to:replyId}:{})});
      if(sendError)throw sendError;
      if(activePersonRef.current===recipientId){setDraft('');setDirectReply(null);await loadMessages(recipientId);}
      return true;
    }catch(sendError){
      if(activePersonRef.current===recipientId){
        const missing=['42703','PGRST204'].includes(sendError.code);
        setError(missing?'The database is missing reply fields. Apply 20260908_direct_message_actions.sql. Your draft has been kept.':`${replyId?'Reply':'Message'} not sent: ${sendError.message||'Network error. Please retry.'}${sendError.code?` (${sendError.code})`:''}`);
      }
      return false;
    }finally{setSending(false);}
  }

  function sendText(event) { event.preventDefault(); if (draft.trim()) insertMessage({ body: draft.trim(), message_type: 'text' }); }
  async function directAction(message,action,emoji=null){
    if(actionBusy)return;
    if(action==='unsend'&&!window.confirm('Unsend for everyone? The recipient may already have read or downloaded it.'))return;
    setActionBusy(true);setError('');
    const {error:actionError}=await (action==='pin'?supabase.rpc('pin_chat_message',{p_key:chatKey,p_message:message.id,p_pinned:!message.pinned}):supabase.rpc('manage_direct_message',{p_message:message.id,p_action:action,p_emoji:emoji}));
    if(actionError)setError(actionError.code==='PGRST202'?'Apply 20260908_direct_message_actions.sql to enable reactions and unsend.':actionError.message);
    else if(selected?.id)await loadMessages(selected.id);
    setActionBusy(false);
  }

  async function uploadFile(event) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file || !selected) return;
    const allowed = ['image/jpeg','image/png','image/webp','image/gif','application/pdf','text/plain','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation'];
    if (file.size > 15 * 1024 * 1024) return setError('Files must be 15 MB or smaller.');
    if (!allowed.includes(file.type)) return setError('This file type is not allowed.');
    setError('');
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${user.id}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from('chat-attachments').upload(path, file);
    if (uploadError) return setError('File upload failed.');
    const sent = await insertMessage({ body: file.name, message_type: file.type.startsWith('image/') ? 'image' : 'file', attachment_url: path, attachment_name: file.name, attachment_type: file.type });
    if (!sent) await supabase.storage.from('chat-attachments').remove([path]);
  }

  function openConversation(person) { setSelectedBatch(null); setSelected(person); setMinimized(false); setDirectoryOpen(false);  }
  function askHelp(event) {
    event.preventDefault();
    const question = helpDraft.trim();
    if (!question) return;
    const answer = getHelpAnswer(question);
    const tutorial = getWalkthrough(question);
    addHelpMessages(current => [...current, { id: crypto.randomUUID(), from: 'you', text: question }, answer
      ? { id: crypto.randomUUID(), from: 'bot', text: answer.a, question: answer.q, tutorial }
      : { id: crypto.randomUUID(), from: 'bot', text: 'I couldn’t find a matching FAQ answer. This visual guide may still help. If it does not, open Help & support and send a private request.', tutorial }
    ]);
    setHelpDraft('');
  }
  async function blockConversation(){if(!selected||!window.confirm(`Block ${nameOf(selected)}?`))return;const{error:blockError}=await supabase.rpc('manage_alumni_block',{p_target:selected.id,p_block:true});if(blockError)setError(blockError.message);else{setPeople(current=>current.filter(person=>person.id!==selected.id));setSelected(null)}}

  useMessageInputSize(directInputRef, draft, `${selected?.id || ''}:${minimized}`);
  return <div className="messenger-root">
    {directoryOpen && <aside className="messenger-directory">
      <header><div><h2>Chats</h2><small>{people.length} registered accounts</small></div><button onClick={() => setDirectoryOpen(false)} aria-label="Close chats">×</button></header>
      <label className="messenger-search"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search alumni or batch" /></label>
      <div className="batch-directory-scroll"><div className="messenger-people batch-chat-directory"><h3>Your batch chats</h3>{batchError && <p role="status">{batchError}</p>}{batchGroups.filter(group => `${group.name} ${group.batch_year || ''}`.toLowerCase().includes(search.toLowerCase())).map(group => <button key={group.id} onClick={() => { setSelected(null); setSelectedBatch(group); setDirectoryOpen(false); }}><span className="chat-avatar">{group.photo_url ? <img src={group.photo_url} alt="" /> : group.batch_year || 'B'}</span><span><strong>{group.name}</strong><small>{group.member_count} batch members</small></span></button>)}{!batchGroups.length && !batchError && <p>Join your batch under Alumni groups to access its chat.</p>}<h3>Help assistant</h3><button className="help-bot-directory-entry" type="button" onClick={() => { setHelpOpen(true); requestAnimationFrame(() => { const log=helpMessagesRef.current; if(log)log.scrollTop=log.scrollHeight; }); }}><span className="chat-avatar help-bot-avatar" aria-hidden="true">✦</span><span><strong>AI help assistant</strong><small>{helpMessages.length>1?'Continue recent chat · clears after 24 hours':'Ask a question · clears after 24 hours'}</small></span><span className="help-bot-entry-arrow" aria-hidden="true">›</span></button><h3>Direct messages</h3></div>
      <div className="messenger-people">{filtered.length ? filtered.map((person) => <button key={person.id} onClick={() => openConversation(person)}><Avatar person={person}/><span><strong>{nameOf(person)}</strong><small>{person.last_message_at ? 'Tap to continue chatting' : 'Start a conversation'}</small></span>{person.unread_count > 0 && <b>{person.unread_count}</b>}</button>) : <p>No registered accounts found.</p>}</div>
      </div>
    </aside>}

    {selectedBatch && <section className={`messenger-window batch-chat-widget ${batchMinimized?'batch-minimized':''}`} aria-label={`${selectedBatch.name} group chat`}><header><span className="chat-avatar small">{selectedBatch.photo_url?<img src={selectedBatch.photo_url} alt=""/>:'B'}</span><div><strong>{batchSettings.name||selectedBatch.name}</strong><small>{selectedBatch.member_count} members · Group chat</small></div><span className="batch-header-menu" ref={setBatchMenuTarget}/><button type="button" aria-label={batchMinimized?'Expand group chat':'Minimize group chat'} onClick={()=>setBatchMinimized(v=>!v)}>{batchMinimized?'+':'−'}</button><button type="button" aria-label="Close batch chat" onClick={() => setSelectedBatch(null)}>×</button></header><BatchConversation key={selectedBatch.id} group={selectedBatch} user={user} kind="chat" menuInHeader menuTarget={batchMenuTarget} /></section>}
    {helpOpen && <section className="messenger-window help-bot-window" aria-label="Alumni help bot"><header><span className="chat-avatar small help-header-avatar" aria-hidden="true">✦</span><div><strong>Alumni help</strong><small>Recent chat · clears after 24 hours</small></div><button type="button" aria-label="Close help bot" onClick={() => setHelpOpen(false)}>×</button></header><div className="help-bot-messages" ref={helpMessagesRef} aria-live="polite">{helpMessages.map(message=><article key={message.id} className={`help-bot-row ${message.from==='you'?'from-user':''}`}>{message.from!=='you'&&<span className="chat-avatar small help-message-avatar" aria-hidden="true">✦</span>}<div className="help-bot-message"><p>{message.text}</p>{message.tutorial&&<ProfilePictureWalkthrough type={message.tutorial} batchGroups={batchGroups} allBatchGroups={allBatchGroups} peopleCount={people.length} profile={profile} userEmail={user?.email} />}{message.question&&<small>Related: {message.question}</small>}</div></article>)}</div><div className="help-bot-prompts">{faqs.map(item=><button key={item.q} type="button" onClick={()=>{setHelpDraft('');const tutorial=getWalkthrough(item.q);addHelpMessages(current=>[...current,{id:crypto.randomUUID(),from:'you',text:item.q},{id:crypto.randomUUID(),from:'bot',text:item.a,question:item.q,tutorial}]);}}>{item.q}</button>)}</div><form className="help-bot-composer" onSubmit={askHelp}><input aria-label="Ask the alumni help bot" value={helpDraft} onChange={event=>setHelpDraft(event.target.value)} placeholder="Ask a question..."/><button disabled={!helpDraft.trim()}>Send</button></form></section>}
    {selected && <section className={`messenger-window ${minimized ? 'minimized' : ''}`}>
      <header onClick={() => minimized && setMinimized(false)}><Avatar person={selected} small/><div><strong>{settings.name||settings.nicknames?.[selected.id]||nameOf(selected)}</strong><small>Registered alumni</small></div><ChatMenu key={chatKey} chatKey={chatKey} user={user} members={[{...profile,id:user.id},selected]} settings={settings} onSettings={setSettings} onBlock={blockConversation}/><button onClick={(e) => { e.stopPropagation(); setMinimized(!minimized); }} aria-label="Minimize chat">−</button><button onClick={(e) => { e.stopPropagation(); setSelected(null); }} aria-label="Close conversation">×</button></header>
      {!minimized && <>
        <ChatCover path={settings.cover}/><div className="messenger-messages batch-messenger-body direct-message-list">{messages.length ? messages.map(m=><DirectMessageBubble myName={settings.nicknames?.[user.id]} key={m.id} message={m} mine={m.sender_id===user.id} person={settings.nicknames?.[selected.id]?{...selected,first_name:settings.nicknames[selected.id],last_name:''}:selected} parent={messages.find(p=>p.id===m.reply_to)} reactions={directReactions.filter(r=>r.message_id===m.id)} busy={actionBusy} onReply={message=>{setDirectReply(message);directInputRef.current?.focus();}} onAction={directAction}/>) : <div className="message-empty"><Avatar person={selected}/><strong>{nameOf(selected)}</strong><p>You can now message each other.</p></div>}<div ref={endRef}/></div>
        {error && <p className="messenger-error">{error}</p>}
        <form className="messenger-composer" onSubmit={sendText}>{directReply&&<div className="batch-reply-compose"><div><strong>Replying to {directReply.sender_id===user.id?'yourself':nameOf(selected)}</strong><span>{messages.find(m=>m.id===directReply.id)?.unsent_at?'Message unsent':directReply.body||directReply.attachment_name||'Attachment'}</span></div><button type="button" aria-label="Cancel reply" onClick={()=>setDirectReply(null)}>×</button></div>}<div className="composer-tools"><button type="button" onClick={() => fileRef.current?.click()} title="Send photo or file">＋</button><MediaPickerButton kind="emoji" disabled={sending} onSelect={emoji => setDraft(value => (value + emoji).slice(0,2000))} />
<MediaPickerButton kind="gif" disabled={sending} onSelect={item => insertMessage({ body: '', message_type: 'gif', attachment_url: item.images.fixed_height_small.url, attachment_name: item.title })} /></div><div className="composer-input"><textarea ref={directInputRef} disabled={sending} aria-label="Message" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Aa" rows="1" maxLength="2000" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form.requestSubmit(); } }}/><button disabled={!draft.trim() || sending} aria-label="Send">➤</button></div><input ref={fileRef} hidden type="file" accept="image/jpeg,image/png,image/webp,image/gif,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" onChange={uploadFile}/></form>
      </>}
    </section>}

    <button className="messenger-launcher" onClick={() => { setHelpOpen(false); if (!directoryOpen) loadPeople(); setDirectoryOpen(!directoryOpen); }} aria-label="Open alumni chats"><span>💬</span>{unread > 0 && <b>{unread > 99 ? '99+' : unread}</b>}</button>
  </div>;
}
