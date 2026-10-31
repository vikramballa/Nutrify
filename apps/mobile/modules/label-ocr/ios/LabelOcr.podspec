Pod::Spec.new do |s|
  s.name           = 'LabelOcr'
  s.version        = '1.0.0'
  s.summary        = 'On-device text recognition for nutrition labels (Apple Vision).'
  s.description    = s.summary
  s.license        = 'MIT'
  s.author         = 'NutriChef'
  s.homepage       = 'https://github.com/vikramballa/Nutrify'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '**/*.{h,m,swift}'
end
