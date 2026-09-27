export function needsIosInstallHelp(userAgent: string, standalone: boolean): boolean {
  return /iPad|iPhone|iPod/.test(userAgent) && !standalone;
}

export function isStandaloneDisplay(matchMediaStandalone: boolean, navigatorStandalone: boolean): boolean {
  return matchMediaStandalone || navigatorStandalone;
}
