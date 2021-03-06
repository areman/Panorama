require File.expand_path('../boot', __FILE__)

require 'rails/all'

# Require the gems listed in Gemfile, including any gems
# you've limited to :test, :development, or :production.
Bundler.require(:default, Rails.env)

# -- begin rails3 relikt
# If you precompile assets before deploying to production, use this line
# Bundler.require(*Rails.groups(:assets => %w(development test)))
# If you want your assets lazily compiled in production, use this line
# Bundler.require(:default, :assets, Rails.env)
# -- end rails3 relikt

module Panorama
  class Application < Rails::Application
    # Settings in config/environments/* take precedence over those specified here.
    # Application configuration should go into files in config/initializers
    # -- all .rb files in that directory are automatically loaded.

    # Set Time.zone default to the specified zone and make Active Record auto-convert to this zone.
    # Run "rake -D time" for a list of tasks for finding time zone names. Default is UTC.
    # config.time_zone = 'Central Time (US & Canada)'

    # The default locale is :en and all translations from config/locales/*.rb,yml are auto loaded.
    # config.i18n.load_path += Dir[Rails.root.join('my', 'locales', '*.{rb,yml}').to_s]
    # config.i18n.default_locale = :de

    # Textdatei zur Erfassung der Panorama-Nutzung
    # Sicherstellen, dass die Datei ausserhalb der Applikation zu liegen kommt und deployment der Applikation überlebt
    config.usage_info_filename = "../../panorama_usage_info.log"
    config.usage_info_filename = ENV['PANORAMA_USAGE_LOG'] if ENV['PANORAMA_USAGE_LOG']


    # -- begin rails3 relikt
    # Configure the default encoding used in templates for Ruby 1.9.
    #config.encoding = "utf-8"

    # Added 15.02.2012, utf8-Problem unter MAcOS nicht gelöst
    #Encoding.default_internal, Encoding.default_external = ['utf-8'] * 2

    # Configure sensitive parameters which will be filtered from the log file.
    #config.filter_parameters += [:password]

    # Enable escaping HTML in JSON.
    #config.active_support.escape_html_entities_in_json = true

    # Enable the asset pipeline
    config.assets.enabled = true

    # Version of your assets, change this if you want to expire all your assets
    #config.assets.version = '1.0'
    # -- end rails3 relikt

    # evtl. Workaround für assets finden
    #config.assets.precompile += %w('application.js', 'application.css')
  end
end


