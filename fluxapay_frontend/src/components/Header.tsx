import React from 'react'

interface HeaderProps {
  title?: string;
  description?: string;
}

const Header = ({ title, description }: HeaderProps) => {
  return (
    <div>
      {title && <h1 className="text-2xl font-bold tracking-tight">{title}</h1>}
      {description && <p className="text-muted-foreground mt-1">{description}</p>}
    </div>
  )
}

export default Header
