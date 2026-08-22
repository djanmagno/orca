import { describe, expect, it } from 'vitest'
import { dropIncoherentCondaActivationEnv } from './conda-activation-env'

describe('dropIncoherentCondaActivationEnv', () => {
  it('drops the activation group when the sentinel outlived CONDA_PREFIX', () => {
    // Why: this exact shape is what makes `conda activate` raise
    // "TypeError: expected str, bytes or os.PathLike object, not NoneType" (#14195).
    const env: Record<string, string> = {
      CONDA_SHLVL: '1',
      CONDA_DEFAULT_ENV: 'base',
      CONDA_PROMPT_MODIFIER: '(base) ',
      CONDA_PREFIX_1: '/opt/miniconda3',
      CONDA_STACKED_2: 'true',
      CONDA_EXE: '/opt/miniconda3/bin/conda',
      CONDA_ROOT: '/opt/miniconda3',
      CONDA_PYTHON_EXE: '/opt/miniconda3/bin/python',
      CONDA_BAT: 'C:\\miniconda3\\condabin\\conda.bat',
      _CE_CONDA: '',
      _CE_M: '',
      PATH: '/usr/bin'
    }

    dropIncoherentCondaActivationEnv(env, 'linux')

    expect(env.CONDA_SHLVL).toBeUndefined()
    expect(env.CONDA_DEFAULT_ENV).toBeUndefined()
    expect(env.CONDA_PROMPT_MODIFIER).toBeUndefined()
    expect(env.CONDA_PREFIX_1).toBeUndefined()
    expect(env.CONDA_STACKED_2).toBeUndefined()
    // Discovery vars are installation state, not activation state: keeping them
    // is what lets the shell's conda hook re-activate from a clean slate.
    expect(env.CONDA_EXE).toBe('/opt/miniconda3/bin/conda')
    expect(env.CONDA_ROOT).toBe('/opt/miniconda3')
    expect(env.CONDA_PYTHON_EXE).toBe('/opt/miniconda3/bin/python')
    expect(env.CONDA_BAT).toBe('C:\\miniconda3\\condabin\\conda.bat')
    expect(env._CE_CONDA).toBe('')
    expect(env._CE_M).toBe('')
    expect(env.PATH).toBe('/usr/bin')
  })

  it('leaves a genuinely activated environment untouched', () => {
    const env: Record<string, string> = {
      CONDA_SHLVL: '2',
      CONDA_PREFIX: '/opt/miniconda3/envs/ml',
      CONDA_PREFIX_1: '/opt/miniconda3',
      CONDA_DEFAULT_ENV: 'ml',
      CONDA_PROMPT_MODIFIER: '(ml) '
    }

    dropIncoherentCondaActivationEnv(env, 'darwin')

    expect(env).toEqual({
      CONDA_SHLVL: '2',
      CONDA_PREFIX: '/opt/miniconda3/envs/ml',
      CONDA_PREFIX_1: '/opt/miniconda3',
      CONDA_DEFAULT_ENV: 'ml',
      CONDA_PROMPT_MODIFIER: '(ml) '
    })
  })

  it('drops the group when a stack slot below the top prefix went missing', () => {
    // Why: `conda deactivate` at CONDA_SHLVL=2 reads CONDA_PREFIX_1, so this shape
    // raises the same TypeError as a missing CONDA_PREFIX — verified against conda.
    const env: Record<string, string> = {
      CONDA_SHLVL: '3',
      CONDA_PREFIX: '/opt/miniconda3/envs/ml',
      CONDA_PREFIX_2: '/opt/miniconda3/envs/tools',
      CONDA_DEFAULT_ENV: 'ml',
      CONDA_EXE: '/opt/miniconda3/bin/conda'
    }

    dropIncoherentCondaActivationEnv(env, 'linux')

    expect(env).toEqual({ CONDA_EXE: '/opt/miniconda3/bin/conda' })
  })

  it('treats an empty stack slot as a hole', () => {
    const env: Record<string, string> = {
      CONDA_SHLVL: '2',
      CONDA_PREFIX: '/opt/miniconda3/envs/ml',
      CONDA_PREFIX_1: ''
    }

    dropIncoherentCondaActivationEnv(env, 'linux')

    expect(env).toEqual({})
  })

  it('does not let a bogus CONDA_SHLVL outrun the keys present', () => {
    // Why: the scan stops at the first hole, so depth is bounded by the env, not the value.
    const env: Record<string, string> = { CONDA_SHLVL: '2000000000', CONDA_PREFIX: '/opt/conda' }

    dropIncoherentCondaActivationEnv(env, 'linux')

    expect(env).toEqual({})
  })

  it("leaves conda's own CONDA_SHLVL=0 hook-ran-nothing state alone", () => {
    const env: Record<string, string> = { CONDA_SHLVL: '0', CONDA_EXE: '/opt/conda/bin/conda' }

    dropIncoherentCondaActivationEnv(env, 'linux')

    expect(env).toEqual({ CONDA_SHLVL: '0', CONDA_EXE: '/opt/conda/bin/conda' })
  })

  it('treats an empty CONDA_PREFIX as missing', () => {
    const env: Record<string, string> = {
      CONDA_SHLVL: '1',
      CONDA_PREFIX: '',
      CONDA_DEFAULT_ENV: 'base'
    }

    dropIncoherentCondaActivationEnv(env, 'linux')

    expect(env).toEqual({})
  })

  it('matches case-variant keys on win32 only', () => {
    const windowsEnv: Record<string, string> = {
      Conda_Shlvl: '1',
      CONDA_Default_Env: 'base',
      Conda_Prefix_1: 'C:\\miniconda3',
      CONDA_EXE: 'C:\\miniconda3\\Scripts\\conda.exe'
    }

    dropIncoherentCondaActivationEnv(windowsEnv, 'win32')

    expect(windowsEnv).toEqual({ CONDA_EXE: 'C:\\miniconda3\\Scripts\\conda.exe' })

    // Why the same input is untouched on POSIX: a lowercase name is a different variable there.
    const posixEnv: Record<string, string> = {
      Conda_Shlvl: '1',
      CONDA_Default_Env: 'base',
      Conda_Prefix_1: '/opt/miniconda3'
    }

    dropIncoherentCondaActivationEnv(posixEnv, 'linux')

    expect(posixEnv).toEqual({
      Conda_Shlvl: '1',
      CONDA_Default_Env: 'base',
      Conda_Prefix_1: '/opt/miniconda3'
    })
  })

  it('resolves stack slots case-insensitively on win32', () => {
    const complete: Record<string, string> = {
      Conda_Shlvl: '2',
      Conda_Prefix: 'C:\\miniconda3\\envs\\ml',
      Conda_Prefix_1: 'C:\\miniconda3'
    }

    dropIncoherentCondaActivationEnv(complete, 'win32')

    expect(complete).toEqual({
      Conda_Shlvl: '2',
      Conda_Prefix: 'C:\\miniconda3\\envs\\ml',
      Conda_Prefix_1: 'C:\\miniconda3'
    })

    const holed: Record<string, string> = {
      Conda_Shlvl: '2',
      Conda_Prefix: 'C:\\miniconda3\\envs\\ml'
    }

    dropIncoherentCondaActivationEnv(holed, 'win32')

    expect(holed).toEqual({})
  })

  it('leaves an environment with no conda state alone', () => {
    const env: Record<string, string> = { PATH: '/usr/bin', HOME: '/home/dev' }

    dropIncoherentCondaActivationEnv(env, 'linux')

    expect(env).toEqual({ PATH: '/usr/bin', HOME: '/home/dev' })
  })

  it('ignores a non-numeric sentinel rather than guessing', () => {
    const env: Record<string, string> = { CONDA_SHLVL: 'weird', CONDA_DEFAULT_ENV: 'base' }

    dropIncoherentCondaActivationEnv(env, 'linux')

    expect(env).toEqual({ CONDA_SHLVL: 'weird', CONDA_DEFAULT_ENV: 'base' })
  })
})
