import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { repairTranslatedValue } from './locale-translation-policy.mjs'

const readLocale = (locale) =>
  JSON.parse(
    readFileSync(new URL(`../../src/renderer/src/i18n/locales/${locale}.json`, import.meta.url), 'utf8')
  )

const orcaAccount = (locale) => readLocale(locale).auto.components.settings.orcaAccount
const orcaAccountKeyPrefix = 'auto.components.settings.orcaAccount.'
const orcaAccountKorean = {
  connected: '연결됨',
  reconnectRequired: '세션이 만료되었습니다. 클라우드 기능을 사용하려면 다시 로그인하세요.',
  unavailable: '이 빌드에서는 Orca 로그인을 사용할 수 없습니다.',
  signedOut: 'Artifacts와 Orca Relay를 포함한 클라우드 기능을 사용하려면 로그인하세요.',
  checking: '계정 상태 확인 중…',
  account: 'Orca 계정',
  signOut: '로그아웃',
  signingIn: '로그인 중…',
  signInAgain: '다시 로그인',
  signIn: 'Orca에 로그인',
  title: 'Orca 계정',
  description: '작업을 즉시 공유하고 어디서든 Orca Mobile에서 데스크톱에 연결하세요.',
  searchDescription: 'Artifacts 및 Orca Relay에서 사용하는 계정에 로그인하거나 로그아웃합니다.',
  benefitsTitle: '계정에 포함된 기능',
  artifactsTitle: 'Artifact 공유',
  artifactsDescription: 'HTML 및 Markdown 파일을 게시하고 Orca에서 공유된 모든 링크를 관리하세요.',
  relayTitle: 'Orca Relay',
  relayDescription: '모바일 네트워크 또는 모든 Wi-Fi에서 Orca Mobile을 이 데스크톱에 연결하세요.',
  skillsTitle: '스킬 공유',
  skillsDescription: '비공개 링크로 하나의 스킬 또는 전체 세트를 공유하고 사용하는 모든 컴퓨터에 설치하세요.'
}

describe('locale-translation-policy ko round 5', () => {
  it('translates every Orca Account setting without falling back to English', () => {
    const korean = orcaAccount('ko')

    expect(korean).toEqual(orcaAccountKorean)
  })

  it('preserves every reviewed Orca Account translation during catalog repair', () => {
    const english = orcaAccount('en')
    for (const [key, expected] of Object.entries(orcaAccountKorean)) {
      expect(
        repairTranslatedValue({
          key: `${orcaAccountKeyPrefix}${key}`,
          enValue: english[key],
          localeValue: english[key],
          locale: 'ko'
        })
      ).toBe(expected)
    }
  })

  it('fixes Korean round 5 review, integration, and search keyword regressions', () => {
    expect(
      repairTranslatedValue({
        key: 'auto.components.sidebar.workspace.status.409528031f',
        enValue: 'Review',
        localeValue: '검토',
        locale: 'ko'
      })
    ).toBe('리뷰')
    expect(
      repairTranslatedValue({
        key: 'auto.components.sidebar.workspace.status.6c1efa2cf8',
        enValue: 'In review',
        localeValue: '검토 중',
        locale: 'ko'
      })
    ).toBe('리뷰 중')
    expect(
      repairTranslatedValue({
        key: 'auto.components.TaskPage.524f095d55',
        enValue: 'Needs review',
        localeValue: '검토 필요',
        locale: 'ko'
      })
    ).toBe('리뷰 필요')
    expect(
      repairTranslatedValue({
        key: 'auto.components.onboarding.IntegrationsStep.277f30eb34',
        enValue:
          'Linear, GitLab, Bitbucket, Azure DevOps, Gitea, and Jira live in Settings > Integrations.',
        localeValue:
          'Linear, GitLab, Bitbucket, Azure DevOps, Gitea 및 Jira는 설정 > 통합에 있습니다.',
        locale: 'ko'
      })
    ).toBe('Linear, GitLab, Bitbucket, Azure DevOps, Gitea 및 Jira는 설정 > 연동에 있습니다.')
    expect(
      repairTranslatedValue({
        key: 'auto.components.settings.general.search.244e3fb4c8',
        enValue: 'Install the Orca skill so agents know to use the Orca CLI.',
        localeValue: '에이전트가 Orca CLI 사용 방법을 알 수 있도록 Orca 기술을 설치합니다.',
        locale: 'ko'
      })
    ).toBe('에이전트가 Orca CLI를 사용하도록 Orca 스킬을 설치하세요.')
    expect(
      repairTranslatedValue({
        key: 'auto.components.editor.MarkdownPreview.322afab6ff',
        enValue: 'Review notes',
        localeValue: '메모 검토',
        locale: 'ko'
      })
    ).toBe('리뷰 노트')
    expect(
      repairTranslatedValue({
        key: 'auto.components.right.sidebar.source.control.repo.icon.ecf63ec3ef',
        enValue: 'Launch',
        localeValue: '시작하다',
        locale: 'ko'
      })
    ).toBe('실행')
    expect(
      repairTranslatedValue({
        key: 'auto.components.GitHubItemDialog.485609c4f2',
        enValue: 'check #',
        localeValue: '확인하다 #',
        locale: 'ko'
      })
    ).toBe('체크 #')
    expect(
      repairTranslatedValue({
        key: 'auto.lib.automation.templates.maintenance.prompt',
        enValue:
          'Check for stuck work, stale generated files, failing validation, and anything that needs human attention. Report only actionable issues.',
        localeValue:
          '작업 중단, 오래 생성된 파일, 유효성 검사 실패 및 사람의 주의가 필요한 모든 사항을 확인하세요. 실행 가능한 문제만 보고하세요.',
        locale: 'ko'
      })
    ).toBe(
      '작업 중단, 오래 생성된 파일, 유효성 검사 실패 및 사람의 주의가 필요한 모든 사항을 확인하세요. 실행 가능한 이슈만 보고하세요.'
    )
    expect(
      repairTranslatedValue({
        key: 'auto.components.GitLabItemDialog.02cbe2de44',
        enValue: 'Pipeline',
        localeValue: '파이프라인',
        locale: 'ko'
      })
    ).toBe('파이프라인')
  })

  // Why: #12113 — brand names stay Latin, but generic workflow nouns keep their Korean.
  it('keeps brand names English and generic workflow terms translated', () => {
    expect(
      repairTranslatedValue({
        key: 'auto.components.feature.wall.BrowserAnimatedVisual.04096318ab',
        enValue: 'Terminal 1',
        localeValue: '터미널 1',
        locale: 'ko'
      })
    ).toBe('터미널 1')
    expect(
      repairTranslatedValue({
        key: 'auto.components.skills.SkillsPage.38e0951c3a',
        enValue: 'Agent Skills',
        localeValue: '에이전트 스킬',
        locale: 'ko'
      })
    ).toBe('에이전트 스킬')
    expect(
      repairTranslatedValue({
        key: 'auto.components.LinearIssueMarkdownDescriptionEditor.d9c47069ef',
        enValue: 'Markdown',
        localeValue: '가격 인하',
        locale: 'ko'
      })
    ).toBe('Markdown')
    expect(
      repairTranslatedValue({
        key: 'auto.components.workspace.cleanup.WorkspaceCleanupDialog.9623a5107d',
        enValue: 'Unpushed commits',
        localeValue: '푸시되지 않은 커밋',
        locale: 'ko'
      })
    ).toBe('푸시되지 않은 커밋')
    expect(
      repairTranslatedValue({
        key: 'auto.components.workspace.cleanup.WorkspaceCleanupDialog.0b1766738a',
        enValue: 'Repo',
        localeValue: '레포',
        locale: 'ko'
      })
    ).toBe('레포')
    expect(
      repairTranslatedValue({
        key: 'auto.components.sidebar.add.repo.local.start.actions.fb4fc5380e',
        enValue: 'Local project, Git repo, or folder with many repos',
        localeValue: '로컬 프로젝트, Git 저장소 또는 저장소가 많은 폴더',
        locale: 'ko'
      })
    ).toBe('로컬 프로젝트, Git 저장소 또는 저장소가 많은 폴더')
  })

  it('re-glues Korean particles after Latin terms without gluing content words', () => {
    // A wrong space before the 에 particle is re-glued onto the Latin term.
    expect(
      repairTranslatedValue({
        key: 'auto.components.StarNagCard.cf82170065',
        enValue: 'Could not star the repo. Make sure',
        localeValue: 'repo 에 스타를 표시할 수 없습니다. 다음을 확인하세요',
        locale: 'ko'
      })
    ).toBe('repo에 스타를 표시할 수 없습니다. 다음을 확인하세요')
    expect(
      repairTranslatedValue({
        key: 'auto.components.github.project.ProjectCell.4b5b871da8',
        enValue: 'No labels in this repo.',
        localeValue: '이 repo 에는 라벨이 없습니다.',
        locale: 'ko'
      })
    ).toBe('이 repo에는 라벨이 없습니다.')
    expect(
      repairTranslatedValue({
        key: 'auto.components.terminal.pane.CloseTerminalDialog.6b9a6975f8',
        enValue:
          'The terminal still has a running process. If you close the terminal, the process will be killed.',
        localeValue:
          'terminal 에는 여전히 실행 중인 프로세스가 있습니다. terminal을 닫으면 프로세스가 종료됩니다.',
        locale: 'ko'
      })
    ).toBe(
      'terminal에는 여전히 실행 중인 프로세스가 있습니다. terminal을 닫으면 프로세스가 종료됩니다.'
    )
    // A correct space before a content word that merely starts with a particle syllable is kept.
    expect(
      repairTranslatedValue({
        key: 'auto.components.JiraIssueWorkspace.76513c7898',
        enValue: 'Close Jira issue preview',
        localeValue: 'Jira 이슈 미리보기 닫기',
        locale: 'ko'
      })
    ).toBe('Jira 이슈 미리보기 닫기')
    expect(
      repairTranslatedValue({
        key: 'auto.components.GitHubItemDialog.3ab6ac0fc8',
        enValue: 'Preview and edit the selected GitHub issue or pull request.',
        localeValue: '선택한 GitHub 이슈 또는 PR을 미리보기하고 편집합니다.',
        locale: 'ko'
      })
    ).toBe('선택한 GitHub 이슈 또는 PR을 미리보기하고 편집합니다.')
  })
})
