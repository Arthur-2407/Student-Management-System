# Enterprise Attendance System - Frontend

Enterprise-grade React frontend for the Employee Attendance, Work Tracking & Leave Management Platform.

## Features

- **Face Recognition Login**: Secure authentication with anti-spoof detection
- **Attendance Tracking**: Check-in/out with geolocation validation
- **Leave Management**: Request and manage leave with approval workflows
- **Reporting & Analytics**: Comprehensive dashboards and exportable reports
- **Security Monitoring**: Real-time security event monitoring
- **Role-based Access**: Different views for employees, supervisors, and admins

## Tech Stack

- **React 18** with TypeScript
- **Tailwind CSS** for styling
- **React Router** for navigation
- **Axios** for API requests
- **Recharts** for data visualization
- **Socket.IO** for real-time communication
- **Zustand** for state management
- **Framer Motion** for animations

## Prerequisites

- Node.js 18+
- npm or yarn

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Build for production:
   ```bash
   npm run build
   ```

4. Preview the production build:
   ```bash
   npm run preview
   ```

## Environment Variables

Create a `.env` file with the following variables:

```
VITE_API_URL=http://localhost:3001
VITE_WS_URL=http://localhost:3001
VITE_FACE_AI_URL=http://localhost:5000
```

## Project Structure

```
src/
├── api/                 # API service clients
├── components/          # Reusable UI components
│   ├── camera/         # Camera-related components
│   ├── charts/         # Chart components
│   ├── dashboard/      # Dashboard components
│   └── layout/         # Layout components
├── contexts/           # React contexts
├── hooks/              # Custom hooks
├── pages/              # Page components
├── services/           # Utility services
├── store/              # State management
└── utils/              # Utility functions
```

## Docker Deployment

The frontend can be deployed using Docker:

```bash
docker build -t attendance-frontend .
docker run -p 3000:3000 attendance-frontend
```

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

### Code Quality

- TypeScript for type safety
- ESLint for code linting
- Prettier for code formatting
- Husky for git hooks

## Security Features

- **Face Anti-Spoof Detection**: Multi-frame liveness detection, challenge-response verification
- **Geofence Validation**: Location-based attendance validation
- **Real-time Monitoring**: Security event tracking and alerts
- **Encrypted Communication**: All data transmitted securely

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a pull request

## License

This project is licensed under the MIT License.