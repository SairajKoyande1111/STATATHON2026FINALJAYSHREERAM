import React, { ReactNode } from "react";
import { SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

interface DashboardLayoutProps {
  children: ReactNode;
  title: string;
  breadcrumbs?: { label: string; href?: string }[];
}

export function DashboardLayout({ children, title, breadcrumbs = [] }: DashboardLayoutProps) {
  return (
    <div className="flex min-h-screen w-full">
      <AppSidebar />
      <SidebarInset className="flex flex-col flex-1">
        <main className="flex-1 overflow-auto p-8" style={{ fontFamily: "'Poppins', sans-serif" }}>
          <div className="mb-8 flex items-start justify-between">
            <div>
              <h1
                className="text-3xl font-semibold text-slate-900 dark:text-white tracking-tight"
                data-testid={`heading-${title.toLowerCase().replace(/\s+/g, "-")}`}
                style={{ fontFamily: "'Poppins', sans-serif" }}
              >
                {title}
              </h1>
            </div>
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem><BreadcrumbLink href="/">Home</BreadcrumbLink></BreadcrumbItem>
                {breadcrumbs.length > 0 && <BreadcrumbSeparator />}
                {breadcrumbs.map((crumb, index) => [
                  index > 0 ? <BreadcrumbSeparator key={`sep-${index}`} /> : null,
                  <BreadcrumbItem key={`item-${index}`}>
                    {crumb.href
                      ? <BreadcrumbLink href={crumb.href}>{crumb.label}</BreadcrumbLink>
                      : <BreadcrumbPage>{crumb.label}</BreadcrumbPage>}
                  </BreadcrumbItem>,
                ]).flat()}
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          {children}
        </main>

        <footer className="border-t bg-slate-50 dark:bg-slate-900 px-8 py-3">
          <div className="flex items-center justify-between text-xs text-slate-400" style={{ fontFamily: "'Poppins', sans-serif" }}>
            <span>Government of India — Ministry of Electronics and Information Technology</span>
            <span>Developed by AIRAVATA Technologies</span>
          </div>
        </footer>
      </SidebarInset>
    </div>
  );
}
