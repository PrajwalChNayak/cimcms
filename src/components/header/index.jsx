import { customIcon } from "../icon";

export default function Header({toggleSidebar}) {


  return (
    <>
     <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-8 sticky top-0 z-10">
          <div className="flex items-center gap-4 flex-1">
            <button
              id="sidebarToggle"
              onClick={toggleSidebar}
              className="text-gray-600 hover:text-gray-900"
            >
              {customIcon.menu}
            </button>
            <div className="relative w-96">
              <input
                type="text"
                placeholder="Search..."
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                {customIcon.search}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <button className="relative text-gray-600 hover:text-gray-900">
              {customIcon.bell}
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-white text-xs flex items-center justify-center">
                3
              </span>
            </button>

            <div className="flex items-center gap-3 border-l pl-6">
              <img
                src="https://ui-avatars.com/api/?name=John+Doe"
                alt="Profile"
                className="w-8 h-8 rounded-full"
              />
              <div className="text-sm">
                <div className="font-semibold text-gray-700">John Doe</div>
                <div className="text-gray-500 text-xs">Administrator</div>
              </div>
              {customIcon.chevronDown}
            </div>
          </div>
        </header>
    </>
  );
}
