# encoding: utf-8
require 'test_helper'
require 'active_session_history_helper'

class ActiveSessionHistoryControllerTest < ActionController::TestCase
  include ActiveSessionHistoryHelper

  setup do
    set_session_test_db_context{
      min_alter_org = Time.new
      max_alter_org = min_alter_org-10000
      @time_selection_end = min_alter_org.strftime("%d.%m.%Y %H:%M")
      @time_selection_start = (max_alter_org).strftime("%d.%m.%Y %H:%M")

      snaps = sql_select_first_row ["SELECT /* Panorama-Tool Ramm */ MAX(Snap_ID) Min_Snap_ID, MAX(Snap_ID) Max_Snap_ID
                                    FROM   DBA_Hist_Snapshot
                                    WHERE  DBID = ?
                                    AND    Begin_Interval_Time BETWEEN ? AND ?
                                   ", session[:database].dbid, max_alter_org, min_alter_org]
      @min_snap_id = snaps.min_snap_id
      @max_snap_id = snaps.max_snap_id
      @groupfilter = {
                :DBID            => session[:database].dbid,
                :time_selection_start => @time_selection_start,
                :time_selection_end   => @time_selection_end,
                :Min_Snap_ID     => @min_snap_id,
                :Max_Snap_ID     => @max_snap_id
        }
    }
  end

  # Ermittlung der zum Typ passenden Werte für Bindevariablen
  def bind_value_from_key_rule(key)
    case key
      when "User"         then 'Hugo'
      when "SQL-ID"       then '123456789'
      when "Session/Sn."  then '1,2'
      when "Operation"    then 'FULL SCAN'
      when "Entry-PL/SQL" then 'Hugo'
      when "PL/SQL"       then 'Hugo'
      when "Module"       then 'Module1'
      when "Action"       then 'Action1'
      when "Event"        then 'db file sequential read'
      when "Wait-Class"   then 'IO'
      when "DB-Object"    then 'DUAL'
      when "DB-Sub-Object"  then 'DUAL'
      when "Service"      then 'DEFAULT'
      when "Program"      then 'sqlplus'
      when "Machine"      then 'ramm.osp-dd.de'
      else 2
    end
  end



  test "list_session_statistics_historic" do
    def do_test(groupby)
      post :list_session_statistic_historic, :format=>:js, :time_selection_start=>@time_selection_start, :time_selection_end=>@time_selection_end, :groupby=>groupby
      assert_response :success
    end

    # Iteration über Gruppierungskriterien
    session_statistics_key_rules.each do |key, value|
      do_test key
    end
  end

  test "list_session_statistic_historic_grouping" do
    def do_inner_test(groupby, outer_groupby, bind_value)
      add_filter = {outer_groupby => bind_value}
      post :list_session_statistic_historic_grouping, :format=>:js, :groupby=>groupby,
           :groupfilter => @groupfilter.merge(add_filter)
      assert_response :success
    end

    def do_outer_test(outer_groupby)
      # Iteration über Gruppierungskriterien
      session_statistics_key_rules.each do |key, value|
        do_inner_test key, outer_groupby, bind_value_from_key_rule(outer_groupby)   # Test mit realem Wert
        do_inner_test key, outer_groupby, nil                                       # Test mit NULL als Filterkriterium
      end
    end

    session_statistics_key_rules.each do |key, value|
      do_outer_test key
    end
  end

  test "refresh_time_selection" do
    post :refresh_time_selection, :format=>:js, :groupfilter=>@groupfilter, :repeat_controller=>:active_session_history, :repeat_action => :list_session_statistic_historic_grouping
    assert_response 302   # redirect_to schwierig im Test?
  end

  test "list_session_statistic_historic_single_record" do
    def do_test(groupby, bind_value)
      add_filter = {groupby => bind_value}
      post :list_session_statistic_historic_single_record, :format=>:js, :groupby=>groupby,
           :groupfilter=>@groupfilter.merge(add_filter)
      assert_response :success
    end

    session_statistics_key_rules.each do |key, value|
      do_test key, bind_value_from_key_rule(key)
    end
  end

  test "list_session_statistics_historic_timeline" do
    def do_test(groupby, bind_value)
      add_filter = {groupby => bind_value}
      post :list_session_statistic_historic_timeline, :format=>:js, :groupby=>groupby,
           :groupfilter=>@groupfilter.merge(add_filter),
           :top_values => ["1", "2", "3"], :group_seconds=>60
      assert_response :success
    end

    session_statistics_key_rules.each do |key, value|
      do_test key, bind_value_from_key_rule(key)
    end
  end

  test "show_prepared_active_session_history" do
    post :show_prepared_active_session_history, :format=>:js, :instance=>1, :sql_id=>@sga_sql_id
    assert_response :success
    post :show_prepared_active_session_history, :format=>:js, :instance=>1, :sid=>@sid
    assert_response :success
  end

  test "list_prepared_active_session_history" do
    post :list_prepared_active_session_history, :format=>:js, :groupby=>"SQL-ID",
         :groupfilter => {
                         :DBID     => session[:database].dbid,
                         :Instance => 1,
                         "SQL-ID"  => @sga_sql_id
         },
         :time_selection_start => @time_selection_start,
         :time_selection_end   => @time_selection_end
    assert_response :success
  end

  test "blocking_locks_historic" do
    post :list_blocking_locks_historic, :format=>:js, :time_selection_start=>@time_selection_start, :time_selection_end=>@time_selection_end
    assert_response :success
  end


end
