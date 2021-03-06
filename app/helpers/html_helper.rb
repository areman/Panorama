# encoding: utf-8

# Diverse Methoden für Client-GUI
module HtmlHelper

 # Anzeige eines start und ende-datetimepickers
  def include_start_end_timepicker(id_suffix = "default")
    start_id = "time_selection_start_#{id_suffix}"
    end_id   = "time_selection_end_#{id_suffix}"

    "<script type='text/javascript'>
       $('##{start_id}').datetimepicker();
       $('##{end_id}').datetimepicker();
    </script>

    <div class='float_left'>
      #{t :time_selection_start_caption, :default=>"Start"}
      #{ text_field_tag(:time_selection_start, default_time_selection_start, :size=>14, :id=>start_id, :title => "#{t :time_selection_start_hint, :default=>"Start of considered time range in format"} '#{human_datetime_minute_mask}'") }
    </div>
    <div class='float_left'>
      #{t :time_selection_end_caption, :default=>"End"}
      #{ text_field_tag(:time_selection_end, default_time_selection_end, :size=>14, :id=>end_id, :title => "#{t :time_selection_end_hint, :default=>"End of considered time range in format"} '#{human_datetime_minute_mask}'") }
    </div>
    ".html_safe
  end


end

