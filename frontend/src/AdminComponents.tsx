import React, { useState } from 'react'
import {
  Activity, ArrowDownToLine, Bell, BookOpen, Building2, Calendar, CalendarDays,
  ChevronDown, ChevronRight, ClipboardCheck, Clock3, CreditCard,
  Database, FileEdit, Fingerprint, LayoutDashboard, LogOut, Megaphone, Menu,
  Palmtree, School, ScrollText, Search, Settings, ShieldAlert, ShieldCheck,
  UserCheck, UserPlus, Users
} from 'lucide-react'

export type NavItem = {
  key: string
  label: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  badge?: string | number
  badgeType?: 'default' | 'warning' | 'success' | 'danger'
}

export type NavGroup = {
  id: string
  title: string
  items: NavItem[]
}

export const ADMIN_NAV_GROUPS: NavGroup[] = [
  {
    id: 'main_dashboard',
    title: 'Main Dashboard',
    items: [
      { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    id: 'faculty_management',
    title: 'Faculty Management',
    items: [
      { key: 'visiting_faculty', label: 'Visiting Faculty', icon: Users },
      { key: 'face_registration', label: 'Face Registration', icon: Fingerprint, badge: 'New', badgeType: 'warning' },
    ],
  },
  {
    id: 'academic_management',
    title: 'Academic Management',
    items: [
      { key: 'departments', label: 'Department Management', icon: Building2 },
      { key: 'courses_subjects', label: 'Course & Subject Management', icon: BookOpen },
      { key: 'academic_years', label: 'Academic Year Management', icon: CalendarDays },
      { key: 'timetable', label: 'Lecture & Timetable Management', icon: Clock3 },
      { key: 'classrooms', label: 'Classroom Management', icon: School },
      { key: 'holidays', label: 'Holiday Management', icon: Palmtree },
    ],
  },
  {
    id: 'attendance_management',
    title: 'Attendance Management',
    items: [
      { key: 'attendance', label: 'Attendance Management', icon: ClipboardCheck },
      { key: 'attendance_corrections', label: 'Attendance Corrections', icon: FileEdit },
      { key: 'availability', label: 'Availability Management', icon: UserCheck },
      { key: 'substitute_faculty', label: 'Substitute Faculty Management', icon: UserPlus },
    ],
  },
  {
    id: 'communication',
    title: 'Communication',
    items: [
      { key: 'notifications', label: 'Notifications & Announcements', icon: Megaphone },
    ],
  },
  {
    id: 'reports_finance',
    title: 'Reports & Finance',
    items: [
      { key: 'reports', label: 'Reports & Analytics', icon: Activity },
      { key: 'workload_payment', label: 'Workload & Payment Summary', icon: CreditCard },
      { key: 'import_export', label: 'Import & Export', icon: ArrowDownToLine },
    ],
  },
  {
    id: 'administration_security',
    title: 'Administration & Security',
    items: [
      { key: 'institution_settings', label: 'Institution Settings', icon: Settings },
      { key: 'roles_permissions', label: 'Admin Roles & Permissions', icon: ShieldCheck },
      { key: 'audit_logs', label: 'Audit Logs', icon: ScrollText },
      { key: 'login_monitoring', label: 'Login & Activity Monitoring', icon: ShieldAlert },
      { key: 'backup_restore', label: 'Backup & Restore', icon: Database },
      { key: 'logout', label: 'Logout', icon: LogOut },
    ],
  },
]

interface AdminSidebarProps {
  currentPage: string
  onSelectPage: (key: string) => void
  onSignOut: () => void
  userRole: string
  userName: string
  collegeName?: string | null
  mobileOpen: boolean
  onCloseMobile: () => void
}

export function AdminSidebar({
  currentPage,
  onSelectPage,
  onSignOut,
  userRole,
  userName,
  collegeName,
  mobileOpen,
  onCloseMobile,
}: AdminSidebarProps) {
  // All groups default to open
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    main_dashboard: true,
    faculty_management: true,
    academic_management: true,
    attendance_management: true,
    communication: true,
    reports_finance: true,
    administration_security: true,
  })

  const toggleGroup = (groupId: string) => {
    setOpenGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }))
  }

  const handleItemClick = (key: string) => {
    if (key === 'logout') {
      onSignOut()
    } else {
      onSelectPage(key)
      onCloseMobile()
    }
  }

  return (
    <>
      <aside className={`admin-sidebar ${mobileOpen ? 'admin-sidebar-open' : ''}`}>
        <div className="admin-brand">
          <div className="admin-brand-icon">
            <Activity size={22} />
          </div>
          <div className="admin-brand-text">
            <h2>AttendEase</h2>
            <span className="admin-portal-badge">ADMIN PORTAL</span>
          </div>
        </div>

        <div className="admin-institution-banner">
          <div className="institution-icon">
            <Building2 size={16} />
          </div>
          <div className="institution-info">
            <strong>{collegeName || 'Institutional Campus'}</strong>
            <span>Multi-Tenant Node</span>
          </div>
        </div>

        <nav className="admin-nav-container">
          {ADMIN_NAV_GROUPS.map((group) => {
            const isOpen = openGroups[group.id] !== false
            const isGroupActive = group.items.some((item) => item.key === currentPage)

            return (
              <div key={group.id} className={`admin-nav-group ${isGroupActive ? 'has-active-child' : ''}`}>
                <button
                  type="button"
                  className="admin-group-header"
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={isOpen}
                >
                  <span className="admin-group-title">{group.title}</span>
                  <div className="admin-group-controls">
                    <span className="admin-group-count">{group.items.length}</span>
                    <ChevronDown
                      size={14}
                      className={`admin-chevron ${isOpen ? 'admin-chevron-open' : ''}`}
                    />
                  </div>
                </button>

                {isOpen && (
                  <div className="admin-group-items">
                    {group.items.map((item) => {
                      const Icon = item.icon
                      const isActive = currentPage === item.key

                      return (
                        <button
                          key={item.key}
                          type="button"
                          className={`admin-nav-item ${isActive ? 'admin-nav-item-active' : ''} ${item.key === 'logout' ? 'admin-nav-item-logout' : ''}`}
                          onClick={() => handleItemClick(item.key)}
                        >
                          <Icon size={16} className="admin-nav-icon" />
                          <span className="admin-nav-label">{item.label}</span>
                          {item.badge && (
                            <span className={`admin-item-badge badge-${item.badgeType || 'default'}`}>
                              {item.badge}
                            </span>
                          )}
                          {isActive && <span className="admin-nav-active-pip" />}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        <div className="admin-sidebar-footer">
          <div className="admin-user-card">
            <div className="admin-avatar">
              {userName.charAt(0).toUpperCase()}
            </div>
            <div className="admin-user-meta">
              <strong>{userName}</strong>
              <span className="admin-role-pill">{userRole.replace('_', ' ')}</span>
            </div>
          </div>
          <button
            type="button"
            className="admin-sidebar-signout"
            onClick={onSignOut}
            title="Log out of secure session"
          >
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {mobileOpen && (
        <div
          className="admin-backdrop"
          onClick={onCloseMobile}
          aria-label="Close sidebar menu"
        />
      )}
    </>
  )
}

interface AdminTopBarProps {
  currentPageTitle: string
  currentCategory: string
  userName: string
  userEmail: string
  onOpenMobile: () => void
  onSignOut: () => void
  onSelectPage: (key: string) => void
}

export function AdminTopBar({
  currentPageTitle,
  currentCategory,
  userName,
  userEmail,
  onOpenMobile,
  onSignOut,
  onSelectPage,
}: AdminTopBarProps) {
  return (
    <header className="admin-topbar">
      <div className="admin-topbar-left">
        <button
          type="button"
          className="admin-mobile-toggle"
          onClick={onOpenMobile}
          aria-label="Toggle navigation menu"
        >
          <Menu size={20} />
        </button>

        <div className="admin-breadcrumbs">
          <span className="breadcrumb-root">AttendEase</span>
          <ChevronRight size={13} className="breadcrumb-sep" />
          <span className="breadcrumb-category">{currentCategory}</span>
          <ChevronRight size={13} className="breadcrumb-sep" />
          <strong className="breadcrumb-active">{currentPageTitle}</strong>
        </div>
      </div>

      <div className="admin-topbar-center">
        <div className="admin-global-search">
          <Search size={15} className="search-icon" />
          <input
            type="text"
            placeholder="Search faculty, departments, timetables..."
            aria-label="Global quick search"
          />
        </div>
      </div>

      <div className="admin-topbar-right">
        <div className="admin-ay-badge" title="Active Academic Cycle">
          <Calendar size={13} />
          <span>AY 2025-2026</span>
        </div>

        <button
          type="button"
          className="admin-icon-btn notification-btn"
          onClick={() => onSelectPage('notifications')}
          title="Notifications & Announcements"
        >
          <Bell size={18} />
          <span className="admin-notif-dot" />
        </button>

        <div className="admin-profile-pill">
          <div className="admin-profile-avatar">
            {userName.charAt(0).toUpperCase()}
          </div>
          <div className="admin-profile-text">
            <strong>{userName}</strong>
            <small>{userEmail}</small>
          </div>
        </div>

        <button
          type="button"
          className="admin-icon-btn admin-quick-logout"
          onClick={onSignOut}
          title="Sign out"
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  )
}

interface AdminPageScaffoldProps {
  title: string
  eyebrow?: string
  description?: string
  actions?: React.ReactNode
  stats?: Array<{ label: string; value: string | number; note?: string; icon: any }>
  children?: React.ReactNode
}

export function AdminPageScaffold({
  title,
  eyebrow,
  description,
  actions,
  stats,
  children,
}: AdminPageScaffoldProps) {
  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <div className="admin-page-titles">
          {eyebrow && <span className="admin-eyebrow">{eyebrow}</span>}
          <h1>{title}</h1>
          {description && <p className="admin-page-desc">{description}</p>}
        </div>
        {actions && <div className="admin-header-actions">{actions}</div>}
      </div>

      {stats && stats.length > 0 && (
        <div className="admin-kpi-grid">
          {stats.map((stat, idx) => {
            const Icon = stat.icon
            return (
              <div key={idx} className="admin-kpi-card">
                <div className="admin-kpi-icon-wrap">
                  <Icon size={18} />
                </div>
                <div className="admin-kpi-content">
                  <span className="admin-kpi-label">{stat.label}</span>
                  <strong className="admin-kpi-value">{stat.value}</strong>
                  {stat.note && <span className="admin-kpi-note">{stat.note}</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="admin-page-body">{children}</div>
    </div>
  )
}
