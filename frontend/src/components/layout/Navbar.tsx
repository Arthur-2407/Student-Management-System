import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  FaGauge, 
  FaUserClock, 
  FaCalendar, 
  FaChartBar, 
  FaShield,
  FaUsers,
  FaBuilding,
  FaRightFromBracket,
  FaClipboardList
} from 'react-icons/fa6';
import { useAuth } from '@contexts/AuthContext';

interface NavItem {
  name: string;
  href: string;
  icon: any;
  roles?: string[];
}

const Navbar = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const navigation: NavItem[] = [
    { name: 'Dashboard', href: '/dashboard', icon: <FaGauge /> },
    { name: 'Attendance', href: '/attendance', icon: <FaUserClock /> },
    { name: 'Leave', href: '/leave', icon: <FaCalendar /> },
    { name: 'Reports', href: '/reports', icon: <FaChartBar /> },
    ...(user?.role === 'student'
      ? [
          { name: 'Assignments', href: '/assignments', icon: <FaClipboardList /> },
        ]
      : []),
    ...(user?.role === 'teacher' || user?.role === 'admin' 
      ? [
          { name: 'Teacher', href: '/teacher', icon: <FaUsers /> },
        ] 
      : []),
    ...(user?.role === 'admin' 
      ? [
          { name: 'Security', href: '/security', icon: <FaShield /> },
        ] 
      : []),
  ];

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
      navigate('/login');
    }
  };

  return (
    <nav className="bg-white/85 backdrop-blur-md border-b border-gray-200/80 sticky top-0 z-50 shadow-sm shadow-gray-100/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16 gap-2 md:gap-4">
          <div className="flex items-center min-w-0 flex-shrink">
            <div className="flex-shrink-0 flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-primary-500 to-secondary-500 flex items-center justify-center text-white text-xs font-bold shadow-sm shadow-primary-500/20">
                AH
              </div>
              <span className="text-lg font-bold bg-gradient-to-r from-gray-900 via-gray-800 to-gray-700 bg-clip-text text-transparent tracking-tight">Attendance Hub</span>
            </div>
            <div className="hidden sm:ml-4 sm:flex sm:space-x-1 md:space-x-1.5 lg:space-x-2 xl:space-x-4 2xl:space-x-5 min-w-0 flex-shrink">
              {navigation.map((item) => {
                const isActive = location.pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={`${
                      isActive
                        ? 'border-primary-500 text-gray-900 font-semibold'
                        : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 font-medium'
                    } inline-flex items-center px-1 lg:px-1.5 xl:px-2 pt-1 border-b-2 text-xs xl:text-sm transition-all duration-200`}
                  >
                    <span className={`text-base ${isActive ? 'text-primary-500' : 'text-gray-400 group-hover:text-gray-500'}`}>{item.icon}</span>
                    <span className="hidden lg:inline ml-1 xl:ml-2">{item.name}</span>
                  </Link>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 md:gap-4 flex-shrink-0">
            {user?.role === 'admin' && (
              <Link
                to="/admin"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 border ${
                  location.pathname === '/admin'
                    ? 'bg-primary-50 text-primary-600 border-primary-100'
                    : 'text-gray-600 hover:bg-gray-50 border-transparent'
                }`}
              >
                <FaBuilding className="text-xs" />
                <span className="hidden sm:inline">Admin</span>
              </Link>
            )}
            <div className="flex items-center text-xs text-gray-500">
              <span 
                className="hidden xl:inline-block max-w-[80px] 2xl:max-w-none truncate font-semibold text-gray-700 mr-2 align-middle"
                title={`${user?.firstName || ''} ${user?.lastName || ''}`}
              >
                <span className="2xl:hidden">{user?.firstName}</span>
                <span className="hidden 2xl:inline">{user?.firstName} {user?.lastName}</span>
              </span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase border ${
                user?.role === 'admin' ? 'bg-danger-50 text-danger-600 border-danger-100' :
                user?.role === 'teacher' ? 'bg-warning-50 text-warning-600 border-warning-100' :
                'bg-primary-50 text-primary-600 border-primary-100'
              }`}>
                {user?.role}
              </span>
            </div>
            <div className="flex-shrink-0">
              <button
                onClick={handleLogout}
                className="relative inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-white bg-danger-600 hover:bg-danger-700 transition-all duration-200 active:scale-[0.98] shadow-sm shadow-danger-500/10"
              >
                <FaRightFromBracket className="text-[10px]" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;