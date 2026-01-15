"use client"

import * as React from "react"
import {
  FlaskConical,
  Gauge,
  LayoutDashboard,
  Sparkles,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar"

const navigation = [
  {
    title: "Overview",
    href: "#overview",
    icon: LayoutDashboard,
  },
  {
    title: "Playground",
    href: "#playground",
    icon: FlaskConical,
  },
  {
    title: "Champion",
    href: "#champion",
    icon: Sparkles,
  },
  {
    title: "Optimization",
    href: "#optimization",
    icon: Gauge,
  },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:!p-1.5"
              tooltip="PromptAgent Studio"
            >
              <a href="#overview">
                <Sparkles className="!size-5 text-primary" />
                <span className="text-base font-semibold">PromptAgent</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Studio</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <a href={item.href}>
                      <item.icon className="size-4" />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter>
        <div className="px-2 py-1 text-xs text-muted-foreground">
          Cmd/Ctrl + B toggles the sidebar.
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
