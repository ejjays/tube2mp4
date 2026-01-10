# 🚀 NexStream

**Tired of converters filled with ads and paywalls for high-resolution video? NexStream is a free, open-source alternative built for speed, quality, and a premium experience without any cost.**

---

## 💡 Why NexStream?

Most online link to video converters today are cluttered with intrusive ads and restrict high-quality downloads (4K or higher) behind paywalls. NexStream was built to solve this—providing a clean, ad-free, and open-source solution that leverages `yt-dlp` to give you the best quality available, for free.

---

## 📸 Preview

<div align="center">
  <img src="public/screenshot.jpg" alt="NexStream UI" width="300px" />
</div>

---

## ✨ Features

- 💥 **Layout**: Minimalist, modern, sleek UI.
- ⚡ **Real-time Progress**: No more guessing! Track your download status in real-time via Server-Sent Events (SSE).
- 🎥 **High-Quality Merging**: Uses `yt-dlp` to fetch and merge the best available video and audio streams.
- 📱 **Fully Responsive**: Works perfectly on mobile, tablet, and desktop.
- 🎨 **Modern Stack**: Built with React, Tailwind CSS, and Vite for lightning-fast performance.

---

## 🛠️ Tech Stack

### Frontend
- **React**: Component-based UI.
- **Vite**: Ultra-fast build tool.
- **Tailwind CSS**: Utility-first styling for that sleek look.
- **Lucide-inspired Icons**: Clean and intuitive iconography.

### Backend
- **Node.js & Express**: Reliable server-side logic.
- **yt-dlp**: The gold standard for video downloads.
- **SSE (Server-Sent Events)**: Pushing live updates directly to your screen.

---

## 🚀 Getting Started

### Installation

### 1. Clone the Repository
```bash
git clone https://github.com/ejjays/nexstream.git
cd nexstream
```

### 2. Setup the Backend
```bash
cd backend
npm install
npm start
```

### 3. Setup the Frontend
```bash
# In the root directory (back from backend folder)
cd ..
npm install
npm run dev
```

---

## 📂 Project Structure

```bash
tube2mp4/
├── backend/                # Node.js server logic
│   ├── index.js            # Main server entry point
│   ├── Dockerfile          # Container configuration
│   └── package.json        # Backend dependencies
├── src/                    # React frontend source
│   ├── assets/             # Images and icons
│   │   ├── icons/          # SVG components
│   │   └── ...             # Logo files
│   ├── components/         # Reusable UI components
│   │   ├── ui/             # Generic UI elements (buttons, inputs)
│   │   ├── Footer.jsx      # Page footer
│   │   ├── Header.jsx      # Navigation header
│   │   └── MainContent.jsx # Core application logic
│   ├── App.jsx             # Main application layout
│   └── main.jsx            # React DOM entry point
├── public/                 # Static assets
├── package.json            # Frontend dependencies
├── vite.config.js          # Vite configuration
└── README.md               # Project documentation
```

---

## 🤝 Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1. **Fork the Project**
2. **Create your Feature Branch** (`git checkout -b feature/AmazingFeature`)
3. **Commit your Changes** (`git commit -m 'Add some AmazingFeature'`)
4. **Push to the Branch** (`git push origin feature/AmazingFeature`)
5. **Open a Pull Request**

---

## 📝 Learning Journey
This project is part of a React learning journey, focusing on component architecture, state management, and interfacing with real-time backends.

---

*Made with ❤️ and a lot of caffeine.*