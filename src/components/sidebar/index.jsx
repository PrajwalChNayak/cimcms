import { useDispatch } from 'react-redux';
import { userLogout } from '../../redux/action/authAction';
import { customIcon } from '../icon';

export default function SideBar({ sidebarOpen }) {
  const dispatch = useDispatch();
  return (
    <>
      <div
        id="sidebar"
        className={`fixed top-0 left-0 w-72 h-screen bg-gradient-to-b from-gray-900 to-gray-800 p-6 flex flex-col justify-between transform transition-transform duration-300 ease-in-out ${sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
      >
        <div>
          <div className="flex items-center gap-3 mb-12">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-white">
              {customIcon.microchip}
            </div>
            <div className="font-['Share_Tech_Mono'] text-2xl text-white">
              IoT Dashboard
            </div>
          </div>

          <ul className="list-none p-0 space-y-2">
            <li>
              <a
                href="#"
                className="flex items-center gap-4 text-gray-300 no-underline text-base p-4 rounded-lg transition-all hover:bg-white/10 hover:text-white active:bg-white/20"
              >
                {customIcon.home}
                <span>Dashboard</span>
              </a>
            </li>
            <li>
              <a
                href="#"
                className="flex items-center gap-4 text-gray-300 no-underline text-base p-4 rounded-lg transition-all hover:bg-white/10 hover:text-white"
              >
                {customIcon.microchip}
                <span>Devices</span>
              </a>
            </li>
            <li>
              <a
                href="#"
                className="flex items-center gap-4 text-gray-300 no-underline text-base p-4 rounded-lg transition-all hover:bg-white/10 hover:text-white"
              >
                {customIcon.chart}
                <span>Analytics</span>
              </a>
            </li>
            <li>
              <a
                href="#"
                className="flex items-center gap-4 text-gray-300 no-underline text-base p-4 rounded-lg transition-all hover:bg-white/10 hover:text-white"
              >
                {customIcon.settings}
                <span>Settings</span>
              </a>
            </li>
          </ul>
        </div>

        <div className="border-t border-gray-700 pt-4">
          <button
            onClick={() => {
              dispatch(userLogout())
            }}
            className="w-full flex items-center gap-4 text-red-400 text-base p-4 rounded-lg transition-all 
            hover:bg-red-500/10 hover:text-red-300 bg-red-500/5 border border-red-500/20 cursor-pointer group"
          >
            <div className="transform transition-transform group-hover:rotate-12">
              {customIcon.logout}
            </div>
            <span className="font-medium">Logout</span>
          </button>
        </div>
      </div>

    </>
  );
}
